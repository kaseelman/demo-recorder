"""Starting and stopping recordings from the editor.

Runs the Swift recorder (recorder/) as a subprocess and follows its "STATUS ..." lines:
countdown N -> recording -> saving -> saved <path>  (or error <message> / cancelled).
"""
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from ..paths import DATA, RECORDINGS, ROOT

RECORDER_DIR = ROOT / "recorder"
RECORDER = Path(os.environ.get("DEMOREC_RECORDER") or RECORDER_DIR / ".build" / "release" / "recorder")
THUMBS = Path(tempfile.gettempdir()) / "demorec-thumbs"

_lock = threading.Lock()
_session = {"state": "idle"}
_proc = None


def ensure_recorder():
    """Build the Swift recorder on first use (or after its sources change)."""
    if "DEMOREC_RECORDER" in os.environ:
        return
    sources = list((RECORDER_DIR / "Sources").rglob("*.swift"))
    if RECORDER.exists() and all(s.stat().st_mtime <= RECORDER.stat().st_mtime for s in sources):
        return
    print("Building the recorder…")
    subprocess.run(["swift", "build", "-c", "release", "-q"], cwd=RECORDER_DIR, check=True)


def list_sources():
    """Displays and windows that can be recorded, with thumbnails in THUMBS."""
    ensure_recorder()
    shutil.rmtree(THUMBS, ignore_errors=True)
    out = subprocess.run([str(RECORDER), "--list-json", "--thumbs", str(THUMBS)],
                         capture_output=True, text=True, timeout=40)
    data = next((json.loads(l) for l in out.stdout.splitlines() if l.startswith("{")), None)
    if out.returncode != 0 or data is None or "error" in data:
        raise PermissionError((data or {}).get("error") or
                              "Couldn't list your screens. Give your terminal app Screen Recording permission "
                              "(System Settings → Privacy & Security), restart it and run ./edit again.")
    return data


def thumb_path(name):
    p = (THUMBS / name).resolve()
    return p if p.parent == THUMBS.resolve() and p.exists() else None


def current():
    with _lock:
        s = dict(_session)
    if s.get("state") == "recording":
        s["elapsed"] = round(time.time() - s["started_at"], 1)
    return s


def start(kind, source_id, countdown=3):
    global _proc
    with _lock:
        if _session.get("state") in ("starting", "countdown", "recording", "saving"):
            raise ValueError("A recording is already in progress")
    ensure_recorder()
    name = time.strftime("%Y-%m-%d_%H-%M-%S")
    out = RECORDINGS / name
    target = ["--window", str(int(source_id))] if kind == "window" else ["--display", str(int(source_id))]
    cmd = [str(RECORDER), "--out", str(out), "--countdown", str(int(countdown)), *target]
    _set(state="starting", name=name, path=str(out), message="")
    _proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
                             env={**os.environ, "DEMOREC_DATA": str(DATA)})
    threading.Thread(target=_follow, args=(_proc,), daemon=True).start()
    return current()


def stop():
    if _proc and _proc.poll() is None:
        _proc.send_signal(signal.SIGINT)
    return current()


def _set(**kw):
    with _lock:
        if kw.get("state") in ("starting",):
            _session.clear()
        _session.update(kw)


def _follow(proc):
    last = ""
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        print(f"[recorder] {line}")
        m = re.match(r"STATUS (\w+) ?(.*)", line)
        if not m:
            last = line
            continue
        kind, arg = m.groups()
        if kind == "countdown":
            _set(state="countdown", countdown=int(arg or 0))
        elif kind == "recording":
            _set(state="recording", started_at=time.time())
        elif kind == "saving":
            _set(state="saving")
        elif kind == "saved":
            _set(state="saved", path=arg, name=Path(arg).name)
        elif kind == "cancelled":
            _set(state="cancelled")
        elif kind == "error":
            _set(state="error", message=arg)
    proc.wait()
    if current().get("state") not in ("saved", "error", "cancelled"):
        _set(state="error", message=last or f"The recorder stopped unexpectedly (exit {proc.returncode})")
