"""Camera planning: where to zoom, when, and how the camera moves between those targets.

The camera works in canvas space (background + frame + recording; see layout.py), so zooming
moves across the whole picture. Zoom blocks store their target as a point on the recording,
so they keep pointing at the same content when the frame or crop changes.

1. Clicks (and drags) are grouped into "focus" moments that fit on screen together
   (or come from hand-edited zoom blocks).
2. Each focus is a target: a gentle zoom centred on the clicked area, starting slightly
   before the first click and held after the last.
3. With "follow" on, the camera re-centres once the cursor gets close to the view's edge.
4. Targets are played as eased moves of fixed length that stop exactly on target.
"""
import math
from dataclasses import dataclass, field

import numpy as np

from .motion import Tween
from .tracking import cursor_track


@dataclass
class Focus:
    points: list = field(default_factory=list)  # (t, x, y) clicks/drag points
    zoom: float = 1.0
    cx: float = 0.0
    cy: float = 0.0
    start: float = 0.0
    end: float = 0.0
    follow: bool = True          # pan with the cursor while zoomed
    follow_from: float = 0.0     # ...starting at this time

    @property
    def t_first(self):
        return self.points[0][0]

    @property
    def t_last(self):
        return self.points[-1][0]

    def bbox(self, extra=None):
        pts = self.points + ([extra] if extra else [])
        xs, ys = [p[1] for p in pts], [p[2] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)


# --------------------------------------------------------------------------- automatic zooms

def focus_points(events):
    """Clicks, plus sampled points along drags, are what the camera should care about."""
    pts, down, last_t = [], None, 0.0
    for e in events:
        if e["type"] == "down":
            pts.append((e["t"], e["x"], e["y"]))
            down, last_t = (e["x"], e["y"]), e["t"]
        elif e["type"] == "move" and down is not None and e["t"] - last_t >= 0.1:
            if math.dist(down, (e["x"], e["y"])) > 20:
                pts.append((e["t"], e["x"], e["y"]))
                last_t = e["t"]
        elif e["type"] == "up" and down is not None:
            if math.dist(down, (e["x"], e["y"])) > 20:
                pts.append((e["t"], e["x"], e["y"]))
            down = None
    return pts


def plan_focuses(events, zc, W, H, pad):
    """Automatic zoom plan from the click history. `zc` is the [zoom] config section."""
    def zoom_for(b):
        bw, bh = b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad
        return min(zc["max_zoom"], W / bw, H / bh)

    segs = []
    for p in focus_points(events):
        s = segs[-1] if segs else None
        if s and p[0] - s.t_last <= zc["merge_gap"] and zoom_for(s.bbox(p)) >= zc["min_zoom"]:
            s.points.append(p)
        else:
            segs.append(Focus([p]))

    out = []
    for s in segs:
        b = s.bbox()
        s.zoom = zoom_for(b)
        if s.zoom < zc["min_zoom"]:
            continue
        vw, vh = W / s.zoom, H / s.zoom
        s.cx = float(np.clip((b[0] + b[2]) / 2, vw / 2, W - vw / 2))
        s.cy = float(np.clip((b[1] + b[3]) / 2, vh / 2, H - vh / 2))
        s.start, s.end = s.t_first - zc["lead_in"], s.t_last + zc["hold"]
        s.follow_from = s.t_first
        out.append(s)

    # Close together: pan straight across instead of zooming out and back in.
    for a, b in zip(out, out[1:]):
        if b.start - a.end <= zc["bridge_gap"]:
            mid = float(np.clip((a.end + b.start) / 2, a.t_last, b.t_first))
            a.end = b.start = mid
    return out


def canvas_events(events, layout):
    """Mouse events with positions mapped from the recording onto the canvas."""
    out = []
    for e in events:
        if "x" in e:
            x, y = layout.to_canvas(e["x"], e["y"])
            e = {**e, "x": x, "y": y}
        out.append(e)
    return out


def auto_segments(rec, cfg, layout):
    zc = cfg["zoom"]
    pad = zc["padding"] * rec.sx * layout.scale  # padding is given in native recording pixels
    return plan_focuses(canvas_events(rec.events, layout), zc, layout.ow, layout.oh, pad)


# --------------------------------------------------------------------------- zoom blocks <-> JSON

def segments_to_json(segs, layout):
    """Zoom blocks as stored in projects: times in recording seconds, zoom relative to the
    canvas, x/y = the point on the recording to centre on (0..1 of the uncropped recording)."""
    out = []
    for s in segs:
        px, py = layout.to_recording(s.cx, s.cy)
        out.append({"start": round(s.start, 3), "end": round(s.end, 3), "zoom": round(s.zoom, 3),
                    "x": round(px / layout.W, 4), "y": round(py / layout.H, 4), "follow": s.follow})
    return out


def segments_from_json(items, events, layout):
    W, H = layout.ow, layout.oh
    clicks = [e["t"] for e in events if e["type"] == "down"]
    segs = []
    for it in sorted(items, key=lambda i: i["start"]):
        start, end = float(it["start"]), float(it["end"])
        if end - start < 0.05:
            continue
        z = min(max(float(it["zoom"]), 1.0), 4.0)
        vw, vh = W / z, H / z
        cx, cy = layout.to_canvas(it["x"] * layout.W, it["y"] * layout.H)
        s = Focus([], zoom=z, start=start, end=end, follow=bool(it.get("follow", False)),
                  cx=float(np.clip(cx, vw / 2, W - vw / 2)), cy=float(np.clip(cy, vh / 2, H - vh / 2)))
        # Like auto zooms, cursor-follow kicks in from the first click inside the block.
        s.follow_from = next((t for t in clicks if start <= t <= end), start)
        segs.append(s)
    for a, b in zip(segs, segs[1:]):
        a.end = min(a.end, b.start)
    return segs


def clip_segments(rec, clip, cfg, layout):
    """A clip's zoom blocks: hand-edited if it has them, otherwise the automatic plan."""
    if clip.get("segments") is not None:
        return segments_from_json(clip["segments"], rec.events, layout)
    saved = rec.load_zooms()
    if saved and "segments" in saved:
        return segments_from_json(saved["segments"], rec.events, layout)
    return auto_segments(rec, cfg, layout)


# --------------------------------------------------------------------------- camera motion

def plan_targets(ts, fx, fy, segs, cc, W, H, sample_rate):
    """Per-sample camera target (zoom, centre). `fx/fy` is the (heavily smoothed) cursor."""
    n = len(ts)
    tz, tx, ty = np.ones(n), np.full(n, W / 2), np.full(n, H / 2)
    look = int(round(cc["lookahead"] * sample_rate))
    margin, delay = cc["follow_margin"], cc["follow_delay"]
    si, active, cx, cy = 0, None, 0.0, 0.0
    for i, t in enumerate(ts):
        while si < len(segs) and segs[si].end <= t:
            si += 1
        s = segs[si] if si < len(segs) and segs[si].start <= t else None
        if s is None:
            active = None
            continue
        if s is not active:
            active, cx, cy = s, s.cx, s.cy
        vw, vh = W / s.zoom, H / s.zoom
        # Follow only once the zoom has settled, and only when the cursor nears the edge.
        # Re-centre with some slack, so the camera repositions calmly instead of chasing
        # every small hand movement (that chasing is what reads as shaking).
        if s.follow and t >= s.follow_from + delay:
            j = min(i + look, n - 1)
            mx, my = vw * (0.5 - margin), vh * (0.5 - margin)
            dx, dy = fx[j] - cx, fy[j] - cy
            if abs(dx) > mx:
                cx += dx - math.copysign(mx * 0.5, dx)
            if abs(dy) > my:
                cy += dy - math.copysign(my * 0.5, dy)
            cx = min(max(cx, vw / 2), W - vw / 2)
            cy = min(max(cy, vh / 2), H - vh / 2)
        tz[i], tx[i], ty[i] = s.zoom, cx, cy
    return tz, tx, ty


def simulate_camera(tz, tx, ty, cc, dt, W, H):
    """Play the targets as eased moves. Zoom moves in log space so it feels uniform."""
    n = len(tz)
    cz, cx, cy = np.empty(n), np.empty(n), np.empty(n)
    sz = Tween(math.log(tz[0]), cc["zoom_time"])
    sx = Tween(tx[0], cc["pan_time"])
    sy = Tween(ty[0], cc["pan_time"])
    for i in range(n):
        z = max(1.0, math.exp(sz.step(math.log(tz[i]), dt)))
        x, y = sx.step(tx[i], dt), sy.step(ty[i], dt)
        vw, vh = W / z, H / z
        cz[i] = z
        cx[i] = min(max(x, vw / 2), W - vw / 2)
        cy[i] = min(max(y, vh / 2), H - vh / 2)
    return cz, cx, cy


def camera_path(rec, segs, cfg, ts, sample_rate, layout):
    """Camera (zoom, centre x, centre y in canvas px) at every time in `ts`."""
    cc = cfg["camera"]
    fx, fy = cursor_track(rec.events, ts, cc["follow_smoothing"], sample_rate, rec.W, rec.H, pin_clicks=False)
    fx, fy = layout.to_canvas(fx, fy)
    tz, tx, ty = plan_targets(ts, fx, fy, segs, cc, layout.ow, layout.oh, sample_rate)
    return simulate_camera(tz, tx, ty, cc, 1.0 / sample_rate, layout.ow, layout.oh)
