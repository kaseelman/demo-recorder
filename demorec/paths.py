"""Filesystem locations.

Code lives in the repository; your data never does. Recordings, projects and uploaded
backgrounds are stored in a data folder outside the checkout (default: ~/Movies/Demo Recorder,
override with the DEMOREC_DATA environment variable), so they can't end up in git.
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDITOR = ROOT / "editor"
CONFIG = ROOT / "config.toml"
BACKGROUNDS = ROOT / "backgrounds"  # generated presets/ and thumbs/ (git-ignored)

DATA = Path(os.environ.get("DEMOREC_DATA") or Path.home() / "Movies" / "Demo Recorder").expanduser()
RECORDINGS = DATA / "recordings"
PROJECTS = DATA / "projects"
UPLOADS = DATA / "backgrounds"     # your own background images


def background_file(rel):
    """Projects refer to backgrounds as 'presets/x.jpg' (shipped) or 'uploads/x.jpg' (yours)."""
    if rel.startswith("uploads/"):
        return UPLOADS / rel[len("uploads/"):]
    return BACKGROUNDS / rel


def migrate_legacy_data():
    """Older versions kept data inside the repository; move it to the data folder once."""
    moves = [(ROOT / "recordings", RECORDINGS), (ROOT / "projects", PROJECTS), (BACKGROUNDS / "uploads", UPLOADS)]
    for old, new in moves:
        if not old.is_dir():
            continue
        new.mkdir(parents=True, exist_ok=True)
        for item in old.iterdir():
            if not (new / item.name).exists():
                shutil.move(str(item), str(new / item.name))
                print(f"Moved {item.relative_to(ROOT)} → {new / item.name}")
        if not any(old.iterdir()):
            old.rmdir()
