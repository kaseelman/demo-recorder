"""Renders one clip frame by frame: camera over the whole canvas, cursor, ripples, motion blur.

The camera maps canvas px -> output px. The recording is warped straight from the source
(recording px -> canvas -> output) so it stays sharp when zoomed in; the background and
glass frame come from a supersampled copy of the canvas (see compose.Card).
"""
import math
import subprocess

import cv2
import numpy as np

from .camera import camera_path, clip_segments
from .config import hex_to_bgr
from .cursor import CursorDrawer, draw_ripple
from .motion import ease_out, lerp_index
from .tracking import cursor_track, press_track

RIPPLE_SECONDS = 0.45


def clip_frames(clip, duration, fps):
    return max(1, int((duration - clip.get("trim_start", 0.0) - clip.get("trim_end", 0.0)) * fps))


def compose_affine(A, B):
    """A ∘ B for 2x3 affine matrices (apply B first)."""
    A, B = np.asarray(A, np.float64), np.asarray(B, np.float64)
    return np.hstack([A[:, :2] @ B[:, :2], A[:, :2] @ B[:, 2:] + A[:, 2:]])


def camera_matrix(z, cx, cy, ow, oh):
    """Canvas px -> output px for a camera centred on (cx, cy) at zoom z."""
    return np.array([[z, 0, ow / 2 - z * cx], [0, z, oh / 2 - z * cy]])


def _apply(M, x, y):
    return M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2]


class ClipRenderer:
    """Call advance() once per output frame, then render_steady() or render_flat()."""

    def __init__(self, rec, clip, cfg, cursor_cfg, layout, fps, preview, blur_amount):
        self.rec, self.cfg, self.kc, self.L, self.fps = rec, cfg, cursor_cfg, layout, fps
        self.segs = clip_segments(rec, clip, cfg, layout)
        self.t_begin = clip.get("trim_start", 0.0)
        self.n_frames = clip_frames(clip, rec.duration, fps)

        # Simulate at a multiple of the frame rate so motion blur can sample between frames.
        self.blur = blur_amount > 0 and not preview
        self.sub = 8 if self.blur else 2
        self.span = 0.5 * blur_amount * self.sub  # shutter: amount 1.0 = 180°
        rate = self.rate = fps * self.sub
        ts = self.t_begin + np.arange(self.n_frames * self.sub + self.sub) / rate
        self.cz, self.cx, self.cy = camera_path(rec, self.segs, cfg, ts, rate, layout)
        ux, uy = cursor_track(rec.events, ts, cursor_cfg["smoothing"], rate, rec.W, rec.H)
        self.ux, self.uy = layout.to_canvas(ux, uy)  # cursor in canvas px
        self.press = press_track(rec.events, ts, 0.05, 1.0 / rate)
        self.last = len(ts) - 1

        style = cursor_cfg.get("style", "arrow")
        self.cursor = CursorDrawer(style) if style != "none" and not rec.cursor_in_video else None
        self.unit = rec.scale * rec.sx * cursor_cfg["size"] * layout.scale  # canvas px per cursor unit (≈1pt)
        self.ripple_color = hex_to_bgr(cursor_cfg["ripple_color"])
        self.clicks = [e["t"] for e in rec.clicks()]
        self.k = -1
        self.dec = None
        self.src = None

    def describe(self):
        return [f"{s.start:6.2f}s – {s.end:6.2f}s  zoom {s.zoom:.2f}×{'  follow' if s.follow else ''}" for s in self.segs]

    # ------------------------------------------------------------------ decoding
    def _read(self):
        rec = self.rec
        if self.dec is None:
            self.dec = subprocess.Popen(
                ["ffmpeg", "-v", "error", "-ss", f"{self.t_begin:.3f}", "-i", str(rec.video),
                 "-vf", f"fps={self.fps},scale={rec.W}:{rec.H}:flags=area",
                 "-frames:v", str(self.n_frames), "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                stdout=subprocess.PIPE, bufsize=rec.W * rec.H * 3 * 2)
        size = rec.W * rec.H * 3
        buf = self.dec.stdout.read(size) if self.dec.stdout else b""
        if len(buf) == size:
            self.src = np.frombuffer(buf, np.uint8).reshape(rec.H, rec.W, 3)
        elif self.src is None:  # source ran short: hold the last frame
            self.src = np.zeros((rec.H, rec.W, 3), np.uint8)

    def close(self):
        if self.dec and self.dec.stdout:
            self.dec.stdout.close()
            self.dec.wait()
            self.dec.stdout = None

    def advance(self):
        self.k += 1
        self._read()
        c = self.k * self.sub
        self.lo, self.hi = c - self.span / 2, c + self.span / 2
        self.mid, self.a, self.b = self._state(c), self._state(self.lo), self._state(self.hi)
        if self.k + 1 >= self.n_frames:
            self.close()

    @property
    def time(self):
        return self.t_begin + self.k / self.fps

    def camera(self):
        return tuple(self.mid[:3])

    # ------------------------------------------------------------------ helpers
    def _state(self, fi):
        return lerp_index((self.cz, self.cx, self.cy, self.ux, self.uy, self.press), fi)

    def _samples(self, motion, step):
        """Shutter samples for motion blur: more samples the further things move this frame."""
        if not self.blur or motion < step:
            return [self.mid]
        n = min(self.cfg["motion_blur"]["max_samples"], int(math.ceil(motion / step)) + 1)
        return [self._state(f) for f in np.linspace(self.lo, self.hi, n)]

    def _cam_motion(self):
        """How far (output px) the view corners move across the shutter interval."""
        L = self.L
        za, xa, ya = self.a[:3]
        hw, hh = L.ow / (2 * za), L.oh / (2 * za)
        Ma, Mb = camera_matrix(*self.a[:3], L.ow, L.oh), camera_matrix(*self.b[:3], L.ow, L.oh)
        return max(math.dist(_apply(Ma, x, y), _apply(Mb, x, y)) for x, y in ((xa - hw, ya - hh), (xa + hw, ya + hh)))

    def _source(self, scale):
        """The source frame, pre-filtered when it will be shrunk (so text doesn't shimmer)."""
        if scale < 0.9:
            return cv2.GaussianBlur(self.src, (0, 0), 0.5 * math.sqrt(1 / scale ** 2 - 1))
        return self.src

    # ------------------------------------------------------------------ frames
    def render_steady(self, card):
        """Full output frame: the camera over background + frame + recording, then the cursor."""
        L = self.L
        cams = self._samples(self._cam_motion(), 1.0)
        src = self._source(L.scale * min(s[0] for s in cams))
        acc = None
        for s in cams:
            M = camera_matrix(*s[:3], L.ow, L.oh)
            content = cv2.warpAffine(src, compose_affine(M, L.rec_matrix()).astype(np.float32), (L.ow, L.oh),
                                     flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            frame = card.world(content, M)
            if len(cams) == 1:
                acc = frame
                break
            if acc is None:
                acc = np.zeros(frame.shape, np.float32)
            cv2.accumulate(frame, acc)
        out = acc if len(cams) == 1 else cv2.convertScaleAbs(acc, alpha=1.0 / len(cams))
        if self.cursor:
            self._draw_overlays(out, lambda s: camera_matrix(*s[:3], L.ow, L.oh))
        return out

    def render_flat(self):
        """Just the recording at its frame size, with the cursor (used during transitions)."""
        L = self.L
        M = np.array(L.rec_matrix(), np.float64)
        M[:, 2] -= (L.x, L.y)  # canvas -> frame-local
        out = cv2.warpAffine(self._source(L.scale), M.astype(np.float32), (L.iw, L.ih),
                             flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        if self.cursor:
            local = np.array([[1.0, 0, -L.x], [0, 1.0, -L.y]])
            self._draw_overlays(out, lambda s: local)
        return out

    def _draw_overlays(self, frame, matrix_for):
        """Click ripples and the cursor. matrix_for(state) maps canvas px -> frame px."""
        M = matrix_for(self.mid)
        if self.kc["ripple"]:
            for tc in self.clicks:
                p = (self.time - tc) / RIPPLE_SECONDS
                if 0 <= p < 1:
                    j = min(max(int(round((tc - self.t_begin) * self.rate)), 0), self.last)
                    ox, oy = _apply(M, self.ux[j], self.uy[j])
                    r = (5 + 14 * ease_out(p)) * self.unit * M[0, 0]
                    draw_ripple(frame, ox, oy, r, self.ripple_color, self.kc["ripple_opacity"] * (1 - p))
        squash = 1 - self.kc["click_scale"]

        def sample(s):
            Ms = matrix_for(s)
            ox, oy = _apply(Ms, s[3], s[4])
            return ox, oy, self.unit * Ms[0, 0] * (1 - squash * s[5])
        a, b = sample(self.a), sample(self.b)
        self.cursor.draw(frame, [sample(s) for s in self._samples(math.dist(a[:2], b[:2]), 2.0)])
