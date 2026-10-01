"""A raw recording: raw.mov (screen, no cursor) + events.json (timestamped mouse events)."""
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .paths import RECORDINGS

ZOOMS_FILE = "zooms.json"  # hand-edited zooms for rendering a recording on its own


def even(v):
    return max(2, int(round(v / 2)) * 2)


def probe_duration(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(video)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


@dataclass
class Recording:
    dir: Path
    meta: dict
    video: Path
    W0: int       # native capture size in pixels
    H0: int
    W: int        # working resolution (smaller for previews and planning)
    H: int
    sx: float     # W / W0
    events: list  # sorted by time, coordinates in working resolution
    duration: float

    @property
    def scale(self):
        """Display scale (2 on Retina): pixels per point."""
        return self.meta["display"]["scale"]

    @property
    def cursor_in_video(self):
        return self.meta.get("cursor_in_video", False)

    def clicks(self):
        return [e for e in self.events if e["type"] == "down"]

    def load_zooms(self):
        p = self.dir / ZOOMS_FILE
        return json.loads(p.read_text()) if p.exists() else None


def load_recording(rec_dir, src_scale=1.0):
    rec_dir = Path(rec_dir)
    meta = json.loads((rec_dir / "events.json").read_text())
    video = rec_dir / meta.get("video", "raw.mov")
    W0, H0 = meta["display"]["width_px"], meta["display"]["height_px"]
    W, H = even(W0 * src_scale), even(H0 * src_scale)
    sx, sy = W / W0, H / H0
    events = sorted(meta["events"], key=lambda e: e["t"])
    for e in events:
        if "x" in e:
            e["x"] *= sx
            e["y"] *= sy
    return Recording(rec_dir, meta, video, W0, H0, W, H, sx, events, probe_duration(video))


def resolve_recording(name):
    """Clips refer to recordings by folder name (inside recordings/) or by absolute path."""
    p = Path(name)
    return p if p.is_absolute() else RECORDINGS / name


def list_recordings():
    if not RECORDINGS.exists():
        return []
    return sorted((p.name for p in RECORDINGS.iterdir() if (p / "events.json").exists() and (p / "raw.mov").exists()),
                  reverse=True)
