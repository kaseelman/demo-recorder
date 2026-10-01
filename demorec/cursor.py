"""Cursor styles drawn on top of the recording, plus click ripples.

Sizes are in "units" of roughly one macOS point, so a cursor looks the same size relative to
the recorded screen no matter the output resolution.
"""
import cv2
import numpy as np

STYLES = ["arrow", "arrow-white", "dot", "highlight", "none"]
ARROW = [(0, 0), (0, 16.5), (4, 12.8), (6.6, 18.8), (9.3, 17.7), (6.8, 11.8), (11.8, 11.8)]


def _over(P, A, color, alpha):
    """Premultiplied 'over' compositing of a flat colour layer."""
    a = alpha[..., None]
    return np.asarray(color, np.float32) * a + P * (1 - a), alpha + A * (1 - alpha)


def _soft(mask, sigma):
    return cv2.GaussianBlur(mask, (0, 0), sigma) if sigma > 0 else mask


def make_sprite(style, ppu=32):
    """Premultiplied BGRA float sprite (colours 0..1) and its hotspot in units."""
    pad = 16 if style == "highlight" else 6
    w = h = int((19 + 2 * pad) * ppu) if style == "highlight" else None
    if style in ("dot",):
        w = h = int(2 * pad * ppu + 16 * ppu)
        hot = (w / 2 / ppu, h / 2 / ppu)
    else:
        w = w or int((12 + 2 * pad) * ppu)
        h = h or int((19 + 2 * pad) * ppu)
        hot = (pad, pad)
    P, A = np.zeros((h, w, 3), np.float32), np.zeros((h, w), np.float32)
    hx, hy = int(hot[0] * ppu), int(hot[1] * ppu)

    if style == "dot":
        disk = np.zeros((h, w), np.float32)
        cv2.circle(disk, (hx, hy), int(7 * ppu), 1.0, -1, cv2.LINE_AA)
        ring = np.zeros((h, w), np.float32)
        cv2.circle(ring, (hx, hy), int(7 * ppu), 1.0, int(1.4 * ppu), cv2.LINE_AA)
        shadow = np.roll(_soft(disk, ppu * 1.2), int(0.8 * ppu), axis=0) * 0.3
        P, A = _over(P, A, (0, 0, 0), shadow)
        P, A = _over(P, A, (0.08, 0.08, 0.08), disk * 0.55)
        P, A = _over(P, A, (1, 1, 1), ring * 0.95)
        return np.dstack([P, A]), hot

    poly = (np.array(ARROW) * ppu + np.array([hx, hy])).astype(np.int32)
    body = np.zeros((h, w), np.uint8)
    cv2.fillPoly(body, [poly], 255, cv2.LINE_AA)
    outline_px = int(1.3 * ppu)
    outer = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * outline_px + 1,) * 2))
    body, outer = body.astype(np.float32) / 255, _soft(outer.astype(np.float32) / 255, ppu * 0.08)
    shadow = np.roll(_soft(outer, ppu * 1.1), int(0.9 * ppu), axis=0) * 0.35

    if style == "highlight":
        halo = np.zeros((h, w), np.float32)
        cv2.circle(halo, (hx, hy), int(14 * ppu), 1.0, -1, cv2.LINE_AA)
        P, A = _over(P, A, (0.29, 0.84, 1.0), _soft(halo, ppu) * 0.38)  # warm yellow, BGR
    fill, edge = ((1, 1, 1), (0.1, 0.1, 0.1)) if style == "arrow-white" else ((0, 0, 0), (1, 1, 1))
    P, A = _over(P, A, (0, 0, 0), shadow)
    P, A = _over(P, A, edge, outer)
    P, A = _over(P, A, fill, body)
    return np.dstack([P, A]), hot


class CursorDrawer:
    def __init__(self, style="arrow"):
        sprite, self.hot = make_sprite(style)
        self.levels, cur, ppu = [], sprite, 32.0
        while ppu >= 0.5:  # mip levels, so small cursors stay crisp instead of aliasing
            self.levels.append((cur, ppu))
            cur, ppu = cv2.pyrDown(cur), ppu / 2

    def draw(self, img, samples):
        """samples: list of (x, y, px_per_unit) in output px. Several samples = motion blur."""
        if not samples:
            return
        need = max(s[2] for s in samples)
        sprite, ppu = self.levels[-1]
        for spr, p in self.levels:  # smallest level that is still >= the needed size
            if p >= need:
                sprite, ppu = spr, p
        sh, sw = sprite.shape[:2]
        hx, hy = self.hot[0] * ppu, self.hot[1] * ppu

        boxes = [(x - hx * u / ppu, y - hy * u / ppu, x + (sw - hx) * u / ppu, y + (sh - hy) * u / ppu)
                 for x, y, u in samples]
        H, W = img.shape[:2]
        x0 = max(0, int(min(b[0] for b in boxes)) - 2)
        y0 = max(0, int(min(b[1] for b in boxes)) - 2)
        x1 = min(W, int(max(b[2] for b in boxes)) + 3)
        y1 = min(H, int(max(b[3] for b in boxes)) + 3)
        if x1 <= x0 or y1 <= y0:
            return
        acc = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
        for x, y, u in samples:
            k = u / ppu
            M = np.float32([[k, 0, x - hx * k - x0], [0, k, y - hy * k - y0]])
            acc += cv2.warpAffine(sprite, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        acc /= len(samples)
        roi = img[y0:y1, x0:x1].astype(np.float32)
        img[y0:y1, x0:x1] = np.clip(roi * (1 - acc[..., 3:4]) + acc[..., :3] * 255, 0, 255).astype(np.uint8)


def draw_ripple(img, x, y, r, color, alpha):
    H, W = img.shape[:2]
    x0, y0 = max(0, int(x - r - 2)), max(0, int(y - r - 2))
    x1, y1 = min(W, int(x + r + 3)), min(H, int(y + r + 3))
    if x1 <= x0 or y1 <= y0 or r <= 0:
        return
    roi = img[y0:y1, x0:x1]
    overlay = roi.copy()
    cv2.circle(overlay, (int((x - x0) * 16), int((y - y0) * 16)), int(r * 16), color, -1, cv2.LINE_AA, shift=4)
    cv2.addWeighted(overlay, alpha, roi, 1 - alpha, 0, dst=roi)
