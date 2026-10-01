"""Preview proxies (small, scrub-friendly copies of raw.mov) and a cache of loaded recordings."""
import subprocess
import threading

from ..recording import load_recording, resolve_recording

_lock = threading.Lock()
_cache = {}


def get_recording(name):
    """Recording at quarter resolution: plenty for planning, fast to load."""
    d = resolve_recording(name).resolve()
    if not (d / "events.json").exists():
        raise FileNotFoundError(f"Recording not found: {name}")
    key = (str(d), (d / "events.json").stat().st_mtime)
    with _lock:
        if key not in _cache:
            _cache[key] = load_recording(d, 0.25)
        return _cache[key]


def ensure_proxy(rec):
    proxy = rec.dir / "proxy.mp4"
    with _lock:
        if proxy.exists() and proxy.stat().st_mtime >= rec.video.stat().st_mtime:
            return proxy
        print(f"Preparing preview video for {rec.dir.name}…")
        tmp = rec.dir / "proxy.tmp.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(rec.video),
                        "-vf", "fps=30,scale=1600:-2", "-c:v", "h264_videotoolbox", "-b:v", "8M",
                        "-g", "10", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(tmp)], check=True)
        tmp.replace(proxy)
        return proxy
