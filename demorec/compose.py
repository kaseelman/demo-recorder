"""Backgrounds, the glass frame around each recording, and clip transitions.

All pixel sizes in a project's style (radius, bezel) are defined for a 1920px-wide canvas
and scaled for other sizes, so previews and finals match.
"""
import math

import cv2
import numpy as np

from .motion import ease_in_out
from .paths import BACKGROUNDS

TRANSITIONS = ["cut", "crossfade", "slide-left", "slide-up", "scale"]


def even(v):
    return max(2, int(round(v / 2)) * 2)


def hex_bgr(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (4, 2, 0)], np.float32)


def rounded_mask(w, h, r, ss=4):
    """Anti-aliased rounded-rectangle mask (float 0..1), drawn supersampled."""
    W, H, R = w * ss, h * ss, int(min(r, w / 2, h / 2) * ss)
    m = np.zeros((H, W), np.uint8)
    if R <= 0:
        m[:] = 255
    else:
        cv2.rectangle(m, (R, 0), (W - 1 - R, H - 1), 255, -1)
        cv2.rectangle(m, (0, R), (W - 1, H - 1 - R), 255, -1)
        for cx, cy in ((R, R), (W - 1 - R, R), (R, H - 1 - R), (W - 1 - R, H - 1 - R)):
            cv2.circle(m, (cx, cy), R, 255, -1, cv2.LINE_AA)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


# --------------------------------------------------------------------------- background

def make_background(spec, w, h):
    """Matches the CSS used by the editor preview (linear/radial gradient semantics included)."""
    kind = spec.get("type", "image")
    if kind == "image":
        img = cv2.imread(str(BACKGROUNDS / spec.get("image", "")))
        if img is None:
            kind = "solid"
        else:
            ih, iw = img.shape[:2]
            s = max(w / iw, h / ih)  # cover
            img = cv2.resize(img, (max(w, round(iw * s)), max(h, round(ih * s))), interpolation=cv2.INTER_AREA)
            y0, x0 = (img.shape[0] - h) // 2, (img.shape[1] - w) // 2
            out = img[y0:y0 + h, x0:x0 + w].astype(np.float32)
    if kind == "solid":
        out = np.broadcast_to(hex_bgr(spec.get("color", "#eef0f5")), (h, w, 3)).astype(np.float32)
    elif kind in ("linear", "radial"):
        # Interpolate in sRGB, like CSS gradients, so the editor preview matches the render.
        cols = np.stack([hex_bgr(c) for c in spec.get("colors", ["#8b7bff", "#ff9ab5"])])
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        if kind == "linear":
            a = math.radians(spec.get("angle", 135))  # CSS: 0deg = to top, clockwise
            dx, dy = math.sin(a), -math.cos(a)
            length = abs(w * dx) + abs(h * dy)
            t = ((x - w / 2) * dx + (y - h / 2) * dy) / length + 0.5
        else:
            cx, cy = spec.get("center", [0.5, 0.3])
            cx, cy = cx * w, cy * h
            far = max(math.hypot(px - cx, py - cy) for px in (0, w) for py in (0, h))  # farthest-corner
            t = np.hypot(x - cx, y - cy) / far
        t = np.clip(t, 0, 1)
        pos = np.linspace(0, 1, len(cols))
        out = np.stack([np.interp(t, pos, cols[:, k]) for k in range(3)], -1)
    if spec.get("blur"):
        out = cv2.GaussianBlur(out, (0, 0), spec["blur"] * w / 1920)
    out = out + np.random.default_rng(7).normal(0, 0.8, out.shape)  # dither: no gradient banding
    return np.clip(out, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------- frame / card

class Card:
    """The rounded, glassy container one recording sits in, plus its drop shadow."""

    E = 2  # px margin around the card for the outer stroke

    def __init__(self, style, bg, layout, supersample=None):
        """`supersample`: (background at N x size, N) for a sharp copy used while zoomed in."""
        L = layout
        self.x, self.y, self.iw, self.ih, b, r = L.x, L.y, L.iw, L.ih, L.b, L.r
        self.b = b
        f = style["frame"]
        oh, ow = bg.shape[:2]
        k = ow / 1920
        self.plain = style["background"].get("type") == "none"
        self.hi, self.ss = None, 1
        if self.plain:
            return
        E = self.E
        cw, ch = self.iw + 2 * b, self.ih + 2 * b
        W, H = cw + 2 * E, ch + 2 * E
        self.cx0, self.cy0 = self.x - b - E, self.y - b - E  # card origin on canvas
        self.size = (W, H)

        outer = np.zeros((H, W), np.float32)
        outer[E:E + ch, E:E + cw] = rounded_mask(cw, ch, r + b if b else r)
        inner = np.zeros((H, W), np.float32)
        inner[E + b:E + b + self.ih, E + b:E + b + self.iw] = rounded_mask(self.iw, self.ih, r)
        self.inner = inner[E + b:E + b + self.ih, E + b:E + b + self.iw][..., None]

        # Glass bezel: frosted background + white tint, a little brighter at the top.
        region = self._crop(cv2.GaussianBlur(bg, (0, 0), 28 * k + 1).astype(np.float32))
        g = np.linspace(1.25, 0.8, H, dtype=np.float32)[:, None, None]
        tint = np.clip(f["glass"] * g, 0, 1)
        bezel = region * (1 - tint) + 255 * tint

        P = bezel * outer[..., None]
        A = outer.copy()

        def over(color, alpha):
            nonlocal P, A
            a = alpha[..., None]
            P = color * a + P * (1 - a)
            A = alpha + A * (1 - alpha)

        if f.get("stroke", True):
            px = max(1, round(k))
            ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1,) * 2)
            ring_out = np.clip(cv2.dilate(outer, ker) - outer, 0, 1)
            over(0.0, ring_out * 0.14)  # crisp dark edge for definition on light backgrounds
            if b > 0:
                ring_hi = np.clip(outer - cv2.erode(outer, ker), 0, 1)
                over(255.0, ring_hi * 0.55)  # glass highlight on the outer rim
                ring_in = np.clip(cv2.dilate(inner, ker) - inner, 0, 1)
                over(0.0, ring_in * 0.22)  # inner edge where the screen meets the glass
        self.P, self.A = P.astype(np.float32), A.astype(np.float32)

        # Drop shadow: wide ambient + tight contact shadow.
        s1, d1, s2, d2 = 34 * k, 22 * k, 5 * k, 3 * k
        m = int(3 * s1 + d1) + 2
        big = np.zeros((H + 2 * m, W + 2 * m), np.float32)
        big[m:m + H, m:m + W] = outer
        amb = np.roll(cv2.GaussianBlur(big, (0, 0), s1), int(d1), axis=0) * 0.42 * f["shadow"]
        con = np.roll(cv2.GaussianBlur(big, (0, 0), s2), int(d2), axis=0) * 0.30 * f["shadow"]
        self.shadow = 1 - (1 - amb) * (1 - con)
        self.m = m

        # Fast path for frames without a transition: everything but the screen, pre-composited.
        rest = bg.astype(np.float32)
        self._apply_shadow(rest, self.shadow, self.cx0 - m, self.cy0 - m, 1.0)
        self._paste(rest, self.P, self.A, self.cx0, self.cy0, 1.0)
        self.rest = rest.astype(np.uint8)
        self.mask = np.zeros((oh, ow), np.float32)  # where the recording shows, in canvas px
        self.mask[self.y:self.y + self.ih, self.x:self.x + self.iw] = self.inner[..., 0]
        if supersample is not None:
            bg_hi, n = supersample
            self.hi, self.ss = Card(style, bg_hi, L.scaled(n)), n

    def world(self, content, M):
        """Full frame for camera matrix M (canvas -> output): background and frame warped by
        the camera, with `content` (already warped to output px) showing through the screen."""
        if self.plain:
            return content
        if np.allclose(M, [[1, 0, 0], [0, 1, 0]], atol=1e-6):
            rest, mask = self.rest, self.mask
        else:
            src = self.hi or self
            Ms = np.array(M, np.float64)
            Ms[:, :2] /= self.ss  # the sharp copy is ss times larger
            size = (self.rest.shape[1], self.rest.shape[0])
            rest = cv2.warpAffine(src.rest, Ms.astype(np.float32), size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            mask = cv2.warpAffine(src.mask, Ms.astype(np.float32), size, flags=cv2.INTER_LINEAR)
        return cv2.blendLinear(content, rest, mask, 1 - mask)

    def _crop(self, img):
        W, H = self.size
        out = np.zeros((H, W, 3), np.float32)
        y0, x0 = self.cy0, self.cx0
        sy0, sx0 = max(0, y0), max(0, x0)
        sy1, sx1 = min(img.shape[0], y0 + H), min(img.shape[1], x0 + W)
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
        return out

    @staticmethod
    def _slices(canvas, x, y, w, h):
        H, W = canvas.shape[:2]
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x1 <= x0 or y1 <= y0:
            return None
        return (slice(y0, y1), slice(x0, x1)), (slice(y0 - y, y1 - y), slice(x0 - x, x1 - x))

    def _apply_shadow(self, canvas, sh, x, y, opacity):
        s = self._slices(canvas, x, y, sh.shape[1], sh.shape[0])
        if s:
            canvas[s[0]] *= (1 - sh[s[1]] * opacity)[..., None]

    def _paste(self, canvas, P, A, x, y, opacity):
        s = self._slices(canvas, x, y, A.shape[1], A.shape[0])
        if s:
            a = A[s[1]][..., None] * opacity
            canvas[s[0]] = P[s[1]] * opacity + canvas[s[0]] * (1 - a)

    def draw(self, canvas, content, dx=0.0, dy=0.0, scale=1.0, opacity=1.0, shadow_opacity=None):
        """Composite onto a float canvas with a transform (used during transitions)."""
        if self.plain:
            a = opacity
            M = np.float32([[scale, 0, dx + (1 - scale) * canvas.shape[1] / 2],
                            [0, scale, dy + (1 - scale) * canvas.shape[0] / 2]])
            warped = cv2.warpAffine(content.astype(np.float32), M, canvas.shape[1::-1])
            mask = cv2.warpAffine(np.ones(content.shape[:2], np.float32), M, canvas.shape[1::-1])[..., None] * a
            canvas[:] = warped * mask + canvas * (1 - mask)
            return
        E, b = self.E, self.b
        P, A = self.P.copy(), self.A.copy()
        cs = (slice(E + b, E + b + self.ih), slice(E + b, E + b + self.iw))
        P[cs] = content * self.inner + P[cs] * (1 - self.inner)
        A[cs] = self.inner[..., 0] + A[cs] * (1 - self.inner[..., 0])
        so = opacity if shadow_opacity is None else shadow_opacity
        if scale == 1.0:
            ix, iy = int(round(dx)), int(round(dy))
            self._apply_shadow(canvas, self.shadow, self.cx0 - self.m + ix, self.cy0 - self.m + iy, so)
            self._paste(canvas, P, A, self.cx0 + ix, self.cy0 + iy, opacity)
            return
        # Scale around the card centre.
        W, H = self.size
        ccx, ccy = self.cx0 + W / 2 + dx, self.cy0 + H / 2 + dy
        size = canvas.shape[1::-1]

        def warp(img, ox, oy):
            M = np.float32([[scale, 0, ccx - scale * (W / 2 - ox)], [0, scale, ccy - scale * (H / 2 - oy)]])
            return cv2.warpAffine(img, M, size, flags=cv2.INTER_LINEAR)
        sh = warp(self.shadow, -self.m, -self.m)
        canvas *= (1 - sh * so)[..., None]
        Pw, Aw = warp(P, 0, 0), warp(A, 0, 0)[..., None] * opacity
        canvas[:] = Pw * opacity + canvas * (1 - Aw)


def transition_frame(bg, kind, p, card_a, content_a, card_b, content_b, camera=None):
    """p goes 0..1 across the transition from clip A to clip B. `camera`: canvas -> output matrix."""
    e = ease_in_out(p)
    canvas = bg.astype(np.float32)
    ow, oh = bg.shape[1], bg.shape[0]
    if kind == "slide-left":
        card_a.draw(canvas, content_a, dx=-e * ow)
        card_b.draw(canvas, content_b, dx=(1 - e) * ow)
    elif kind == "slide-up":
        card_a.draw(canvas, content_a, dy=-e * oh)
        card_b.draw(canvas, content_b, dy=(1 - e) * oh)
    elif kind == "scale":
        card_a.draw(canvas, content_a, scale=1 - 0.06 * e, opacity=1 - e)
        card_b.draw(canvas, content_b, scale=1.06 - 0.06 * e, opacity=e)
    else:  # crossfade
        card_a.draw(canvas, content_a, opacity=1.0, shadow_opacity=1 - e)
        card_b.draw(canvas, content_b, opacity=e)
    out = np.clip(canvas, 0, 255).astype(np.uint8)
    if camera is not None and not np.allclose(camera, [[1, 0, 0], [0, 1, 0]], atol=1e-6):
        out = cv2.warpAffine(out, np.float32(camera), (ow, oh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    return out
