"""Default settings, merged with config.toml."""
import copy
import tomllib

from .paths import CONFIG

DEFAULTS = {
    "output": {"width": 1920, "fps": 60, "encoder": "h264_videotoolbox", "bitrate": "24M", "crf": 18},
    "zoom": {"max_zoom": 1.5, "min_zoom": 1.12, "padding": 260, "lead_in": 0.6, "hold": 1.4,
             "merge_gap": 2.5, "bridge_gap": 1.2},
    "camera": {"pan_time": 1.0, "zoom_time": 1.1, "follow_margin": 0.15, "follow_smoothing": 0.3,
               "follow_delay": 0.5, "lookahead": 0.15},
    "cursor": {"style": "arrow", "size": 1.5, "smoothing": 0.1, "click_scale": 0.82,
               "ripple": True, "ripple_color": "#000000", "ripple_opacity": 0.16},
    "motion_blur": {"enabled": True, "amount": 0.35, "max_samples": 8},
    "background": {"type": "none"},
    "frame": {},
}


def load_config(path=CONFIG):
    cfg = copy.deepcopy(DEFAULTS)
    if path and path.exists():
        with open(path, "rb") as f:
            for section, values in tomllib.load(f).items():
                cfg.setdefault(section, {}).update(values)
    if "scale" in cfg["cursor"]:  # older config files called it "scale"
        cfg["cursor"].setdefault("size", cfg["cursor"].pop("scale"))
    return cfg


def hex_to_bgr(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (4, 2, 0))
