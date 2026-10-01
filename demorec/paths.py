"""Filesystem locations. Everything lives next to the repository checkout."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORDINGS = ROOT / "recordings"
PROJECTS = ROOT / "projects"
BACKGROUNDS = ROOT / "backgrounds"
EDITOR = ROOT / "editor"
CONFIG = ROOT / "config.toml"
