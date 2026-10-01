"""Editor operations. Each function takes plain data and returns JSON-ready data."""
import re
import secrets
import subprocess
from pathlib import Path

import numpy as np

from .. import compose, cursor
from ..camera import camera_path, segments_from_json
from ..config import load_config
from ..layout import clip_layout, project_canvas
from ..paths import BACKGROUNDS
from ..project import (create_project, cursor_settings, list_projects, load_project, new_clip,
                       project_dir, save_project)
from ..recording import list_recordings
from ..tracking import cursor_track
from . import jobs
from .media import ensure_proxy, get_recording

PATH_FPS = 60    # camera path resolution sent to the browser
CURSOR_FPS = 30
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _round(a, n=4):
    return [round(float(v), n) for v in a]


def _layout(project, clip, rec):
    first = project["clips"][0] if project["clips"] else clip
    ow, oh = project_canvas(project if project["clips"] else {**project, "clips": [clip]}, get_recording(first["recording"]))
    return clip_layout(project, ow, oh, rec.W, rec.H, clip)


def camera_preview(project, clip, rec):
    """The exact camera motion the renderer will use, as fractions of the canvas."""
    layout = _layout(project, clip, rec)
    segs = segments_from_json(clip.get("segments") or [], rec.events, layout)
    ts = np.arange(int(rec.duration * PATH_FPS) + 1) / PATH_FPS
    cz, cx, cy = camera_path(rec, segs, load_config(), ts, PATH_FPS, layout)
    return {"fps": PATH_FPS, "z": _round(cz, 3), "x": _round(cx / layout.ow), "y": _round(cy / layout.oh)}


def cursor_preview(rec, smoothing):
    ts = np.arange(int(rec.duration * CURSOR_FPS) + 1) / CURSOR_FPS
    x, y = cursor_track(rec.events, ts, smoothing, CURSOR_FPS, rec.W, rec.H)
    return {"fps": CURSOR_FPS, "x": _round(x / rec.W), "y": _round(y / rec.H)}


def recording_info(project, clip, smoothing):
    rec = get_recording(clip["recording"])
    ensure_proxy(rec)
    return {
        "duration": rec.duration, "width": rec.W0, "height": rec.H0, "scale": rec.scale,
        "clicks": [{"t": round(e["t"], 3), "x": round(e["x"] / rec.W, 4), "y": round(e["y"] / rec.H, 4)}
                   for e in rec.clicks()],
        "cursor": cursor_preview(rec, smoothing),
        "path": camera_preview(project, clip, rec),
    }


def editor_defaults():
    c = load_config()
    k = c["cursor"]
    return {"zoom": c["zoom"]["max_zoom"], "ripple_color": k["ripple_color"],
            "ripple_opacity": k["ripple_opacity"], "click_scale": k["click_scale"]}


def list_backgrounds():
    def files(sub):
        d = BACKGROUNDS / sub
        return sorted(f"{sub}/{p.name}" for p in d.iterdir() if p.suffix.lower() in IMAGE_EXT) if d.exists() else []
    return {"presets": files("presets"), "uploads": files("uploads")}


# --------------------------------------------------------------------------- endpoints

def project_state(pid):
    d = project_dir(pid)
    project = load_project(d)
    smoothing = cursor_settings(project, load_config())["smoothing"]
    info, missing = {}, []
    for clip in project["clips"]:
        try:
            info[clip["id"]] = recording_info(project, clip, smoothing)
        except FileNotFoundError:
            missing.append(clip["recording"])
    project["clips"] = [c for c in project["clips"] if c["id"] in info]
    return {"id": pid, "project": project, "info": info, "missing": missing,
            "projects": list_projects(), "recordings": list_recordings(),
            "backgrounds": list_backgrounds(), "transitions": compose.TRANSITIONS,
            "cursor_styles": cursor.STYLES, "defaults": editor_defaults()}


def add_recording(pid, name, smoothing):
    project = load_project(project_dir(pid))
    first = get_recording(project["clips"][0]["recording"]) if project["clips"] else None
    clip = new_clip(name, get_recording(name), load_config(), project, first)
    return {"clip": clip, "info": recording_info(project, clip, smoothing)}


def save(pid, project, cursor_changed):
    """Save, and return fresh camera/cursor previews. Camera paths depend on zooms, crop and
    the frame layout, so they are recomputed for every clip (it's fast)."""
    save_project(project_dir(pid), project)
    smoothing = cursor_settings(project, load_config())["smoothing"]
    paths, cursors = {}, {}
    for clip in project["clips"]:
        rec = get_recording(clip["recording"])
        paths[clip["id"]] = camera_preview(project, clip, rec)
        if cursor_changed:
            cursors[clip["id"]] = cursor_preview(rec, smoothing)
    return {"paths": paths, "cursors": cursors}


def new_project(recording=None):
    if recording is None and (names := list_recordings()):
        recording = names[0]
    return {"id": create_project((recording, get_recording(recording)) if recording else None, load_config())}


def upload_background(filename, data):
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename)
    if Path(name).suffix.lower() not in IMAGE_EXT:
        raise ValueError("Use a JPG, PNG or WebP image")
    d = BACKGROUNDS / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    dest = d / f"{secrets.token_hex(3)}-{name}"
    dest.write_bytes(data)
    return {"path": f"uploads/{dest.name}"}


def render(pid, preview):
    ok = jobs.start(project_dir(pid), preview)
    return {"ok": ok, "job": jobs.current()}


def open_output(pid, kind, reveal):
    f = project_dir(pid) / ("final.mp4" if kind == "final" else "preview.mp4")
    if not f.exists():
        raise FileNotFoundError("Not rendered yet")
    subprocess.run(["open", "-R", str(f)] if reveal else ["open", str(f)])
    return {"ok": True}
