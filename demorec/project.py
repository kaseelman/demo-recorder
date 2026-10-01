"""The project model: an ordered list of clips plus the look (background, frame, cursor, output).

project.json
  title, output{aspect,width}, background{type,image,colors,angle,center,color,blur},
  frame{padding,radius,bezel,glass,shadow,stroke}, cursor{style,size,smoothing,ripple},
  motion_blur, clips[{id, recording, crop{x,y,w,h}, trim_start, trim_end, segments, transition{type,duration}}]

Zoom blocks (segments) use recording time; their zoom is relative to the whole canvas and
x/y is the point on the recording to centre on (see camera.py).
"""
import copy
import json
import secrets
import time
from pathlib import Path

from .camera import auto_segments, segments_to_json
from .clip import clip_frames
from .layout import FULL_CROP, clip_layout, project_canvas
from .paths import PROJECTS
from .recording import ZOOMS_FILE

STYLE_DEFAULTS = {
    "output": {"aspect": "16:9", "width": 1920},
    "background": {"type": "image", "image": "presets/big-sur.jpg", "colors": ["#8b7bff", "#ff9ab5"],
                   "angle": 135, "center": [0.5, 0.3], "color": "#eef0f5", "blur": 0},
    "frame": {"padding": 0.07, "radius": 14, "bezel": 10, "glass": 0.35, "shadow": 0.5, "stroke": True},
    "cursor": {"style": "arrow", "size": 1.5, "smoothing": 0.1, "ripple": True},
    "motion_blur": 0.35,
}


def with_defaults(project):
    """Fill in anything an older project file lacks."""
    for k, v in STYLE_DEFAULTS.items():
        if isinstance(v, dict):
            project[k] = {**copy.deepcopy(v), **project.get(k, {})}
        else:
            project.setdefault(k, v)
    project.setdefault("clips", [])
    return project


def cursor_settings(project, cfg):
    """Project cursor choices layered over the [cursor] config (ripple colour etc.)."""
    return {**cfg["cursor"], **project.get("cursor", {})}


def new_project(title=None):
    return with_defaults({"version": 3, "title": title or f"Demo {time.strftime('%d %b %H:%M')}", "clips": []})


def new_clip(name, rec, cfg, project, first_rec=None):
    """A clip for a recording, with automatic zooms planned for this project's canvas."""
    saved = rec.load_zooms() or {}
    clip = {"id": secrets.token_hex(4), "recording": name, "crop": dict(FULL_CROP),
            "trim_start": saved.get("trim_start", 0.0), "trim_end": saved.get("trim_end", 0.0),
            "transition": {"type": "crossfade", "duration": 0.6}}
    canvas_project = project if project["clips"] else {**project, "clips": [clip]}
    ow, oh = project_canvas(canvas_project, first_rec or rec)
    layout = clip_layout(project, ow, oh, rec.W, rec.H, clip)
    clip["segments"] = saved.get("segments") or segments_to_json(auto_segments(rec, cfg, layout), layout)
    return clip


def timeline(project, durations, fps):
    """Start frame and length (frames) of each clip; transitions overlap neighbouring clips."""
    starts, lengths, trans = [], [], []
    cur = 0
    for i, (clip, dur) in enumerate(zip(project["clips"], durations)):
        n = clip_frames(clip, dur, fps)
        t = clip.get("transition") or {}
        kind = t.get("type", "cut")
        d = 0 if i == 0 or kind == "cut" else int(round(t.get("duration", 0.6) * fps))
        d = min(d, n // 2, lengths[-1] // 2) if i else 0
        cur -= d
        starts.append(cur)
        lengths.append(n)
        trans.append((kind if d else "cut", d))
        cur += n
    return starts, lengths, trans, cur


def project_from_recording(rec_dir, cfg, use_saved=True, trim_start=None, trim_end=None):
    """Render a single recording on its own, styled by config.toml."""
    rec_dir = Path(rec_dir)
    saved = json.loads((rec_dir / ZOOMS_FILE).read_text()) if use_saved and (rec_dir / ZOOMS_FILE).exists() else {}
    clip = {"recording": str(rec_dir.resolve()),
            "segments": saved.get("segments") if use_saved else [],
            "trim_start": saved.get("trim_start", 0.0) if trim_start is None else trim_start,
            "trim_end": saved.get("trim_end", 0.0) if trim_end is None else trim_end}
    if not use_saved:
        clip.pop("segments")  # -> automatic zooms
    project = new_project()
    project["background"].update(cfg.get("background", {}))
    project["frame"].update(cfg.get("frame", {}))
    project["output"]["width"] = cfg["output"]["width"]
    project["cursor"] = {k: cfg["cursor"][k] for k in ("style", "size", "smoothing", "ripple")}
    mb = cfg["motion_blur"]
    project["motion_blur"] = mb.get("amount", 0.35) if mb.get("enabled", True) else 0
    project["clips"] = [clip]
    return project


# --------------------------------------------------------------------------- storage

def project_dir(pid):
    p = (PROJECTS / pid).resolve()
    if p.parent != PROJECTS.resolve() or not (p / "project.json").exists():
        raise FileNotFoundError(f"Project not found: {pid}")
    return p


def load_project(path):
    return with_defaults(json.loads((Path(path) / "project.json").read_text()))


def save_project(path, project):
    (Path(path) / "project.json").write_text(json.dumps(project, indent=2))


def create_project(first=None, cfg=None):
    """New project folder; `first` = (name, recording) to start with."""
    pid = time.strftime("%Y-%m-%d_%H-%M-%S")
    d = PROJECTS / pid
    d.mkdir(parents=True, exist_ok=True)
    project = new_project()
    if first:
        project["clips"].append(new_clip(first[0], first[1], cfg, project))
    save_project(d, project)
    return pid


def list_projects():
    if not PROJECTS.exists():
        return []
    out = []
    for p in PROJECTS.iterdir():
        f = p / "project.json"
        if f.exists():
            try:
                out.append({"id": p.name, "title": json.loads(f.read_text()).get("title") or p.name,
                            "mtime": f.stat().st_mtime})
            except json.JSONDecodeError:
                pass
    return sorted(out, key=lambda x: -x["mtime"])
