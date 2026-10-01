"""Runs renders in a subprocess and tracks their progress for the editor."""
import re
import subprocess
import sys
import threading

from ..paths import ROOT

_job = None


def current():
    return _job or {}


def start(project_dir, preview):
    global _job
    if _job and _job["running"]:
        return False
    out = project_dir / ("preview.mp4" if preview else "final.mp4")
    cmd = [sys.executable, "-m", "demorec.cli", "render", str(project_dir), "-o", str(out)] + (["--preview"] if preview else [])
    job = _job = {"running": True, "progress": 0.0, "line": "Starting…", "output": str(out), "error": None,
                  "kind": "preview" if preview else "final", "project": project_dir.name}

    def run():
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT)
        buf, tail = b"", []
        while chunk := p.stdout.read(256):
            buf += chunk
            *parts, buf = re.split(rb"[\r\n]", buf)
            for part in parts:
                line = part.decode(errors="replace").strip()
                if not line:
                    continue
                tail = (tail + [line])[-8:]
                if m := re.search(r"rendering (\d+)/(\d+)", line):
                    job["progress"] = int(m[1]) / int(m[2])
                job["line"] = line
        p.wait()
        job["running"] = False
        if p.returncode == 0:
            job["progress"] = 1.0
        else:
            job["error"] = "\n".join(tail)
            print("Render failed:\n" + job["error"])

    threading.Thread(target=run, daemon=True).start()
    return True
