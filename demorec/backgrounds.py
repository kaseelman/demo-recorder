#!/usr/bin/env python3
"""Generate the soft, Apple-style wallpaper presets in backgrounds/presets/.

Each preset is a multi-stop gradient laid along a gently warped axis (the "silk" look),
plus a few large blurred colour blobs, a soft sheen and fine grain to avoid banding.
Run again any time; output is deterministic.
"""
import cv2
import numpy as np

from .paths import BACKGROUNDS

OUT = BACKGROUNDS / "presets"
THUMBS = BACKGROUNDS / "thumbs"
W, H = 3840, 2160

# name: (gradient stops, blob colours, angle in degrees, warp strength, seed)
PRESETS = {
    "sonoma":    (["#f6c08c", "#f08a7e", "#c06aa8", "#6f5bc4"], ["#ffd7a8", "#ff9db0", "#8e7cf0"], 125, 0.10, 1),
    "big-sur":   (["#1d2b6b", "#4b3fa8", "#c35aa6", "#ff9a8b"], ["#ff7eb3", "#6a5cff", "#2fb3ff"], 160, 0.12, 2),
    "ventura":   (["#ffb36b", "#ff7a59", "#5a4fcf", "#1b2a6b"], ["#ffcf7a", "#ff6b9a", "#3d7bff"], 145, 0.09, 3),
    "monterey":  (["#2a1b5e", "#6a3bc9", "#e0569a", "#ffb48a"], ["#ff5fa2", "#8f6bff", "#ffd3a1"], 110, 0.14, 4),
    "aurora":    (["#071a2f", "#0f4c5c", "#2bb3a3", "#c8f2c2"], ["#3be0b8", "#2a7fff", "#a6ffcb"], 150, 0.11, 5),
    "lavender":  (["#f3eefe", "#d9d0fb", "#b9b4f6", "#a5c0f5"], ["#ffffff", "#c8b6ff", "#b5d3ff"], 135, 0.08, 6),
    "peach":     (["#fff1e6", "#ffd6c2", "#ffb3a7", "#f59fb9"], ["#ffe8d1", "#ff9e9e", "#ffc6e0"], 120, 0.08, 7),
    "mint":      (["#effcf6", "#c9f2e3", "#9fe0d6", "#8ec5f0"], ["#ffffff", "#7ee2c4", "#9cc8ff"], 140, 0.08, 8),
    "ocean":     (["#04203f", "#0a4a8c", "#1f8fd1", "#8fd8ff"], ["#2ec5ff", "#1b5cff", "#bdf0ff"], 165, 0.12, 9),
    "sunset":    (["#2b1055", "#7b2f8e", "#e8547a", "#ffb35c"], ["#ff8a5c", "#c13bd1", "#ffd08a"], 175, 0.10, 10),
    "graphite":  (["#0e0f13", "#1f2229", "#383d48", "#5b6170"], ["#4a5163", "#2a2f3a", "#6b7385"], 150, 0.10, 11),
    "midnight":  (["#05060f", "#111a3d", "#28307a", "#5a4fcf"], ["#3d4bff", "#7a5cff", "#1a2a6b"], 130, 0.12, 12),
    "rose":      (["#fff0f3", "#ffd1dc", "#f7a6c1", "#c9a7f5"], ["#ffffff", "#ff9fc0", "#d3b8ff"], 115, 0.09, 13),
    "sky":       (["#eaf6ff", "#c4e4ff", "#9ccaff", "#b9b4f6"], ["#ffffff", "#8cc8ff", "#d6ccff"], 160, 0.08, 14),
}


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def make(stops, blobs, angle, warp, seed, w=W, h=H):
    rng = np.random.default_rng(seed)
    s = 960 / w  # work small (everything is smooth), upscale at the end
    sw, sh = int(w * s), int(h * s)
    y, x = np.mgrid[0:sh, 0:sw].astype(np.float32)
    x /= sw
    y /= sh
    aspect = sw / sh

    # Warped gradient axis -> flowing "silk" bands.
    a = np.deg2rad(angle)
    dx, dy = np.sin(a), -np.cos(a)
    t = ((x - .5) * aspect * dx + (y - .5) * dy) / (abs(aspect * dx) + abs(dy)) + .5
    for _ in range(3):
        f, ph, amp = rng.uniform(0.5, 1.4), rng.uniform(0, 2 * np.pi), warp * rng.uniform(.5, 1)
        t += amp * np.sin(2 * np.pi * f * (x * dy - y * dx) + ph)
    t = np.clip(t, 0, 1)

    cols = to_linear(np.stack([hex_rgb(c) for c in stops]))
    pos = np.linspace(0, 1, len(stops))
    img = np.stack([np.interp(t, pos, cols[:, k]) for k in range(3)], -1)

    # Soft colour blobs.
    for c in blobs:
        cx, cy = rng.uniform(.1, .9), rng.uniform(.1, .9)
        r = rng.uniform(.25, .45)
        d2 = ((x - cx) * aspect) ** 2 + (y - cy) ** 2
        m = np.exp(-d2 / (2 * r * r))[..., None] * rng.uniform(.35, .6)
        img = img * (1 - m) + to_linear(hex_rgb(c)) * m

    # Glossy sheen along one fold.
    ph = rng.uniform(0, 2 * np.pi)
    fold = np.exp(-((t - .5 - .05 * np.sin(2 * x + ph)) ** 2) / .03)[..., None]
    img = img + fold * .04

    img = cv2.GaussianBlur(img, (0, 0), sw * .02)
    img = cv2.resize(img, (w, h), interpolation=cv2.INTER_CUBIC)
    out = to_srgb(img) * 255
    out += np.random.default_rng(seed + 100).normal(0, 1.2, out.shape)  # grain kills banding
    return np.clip(out, 0, 255).astype(np.uint8)[..., ::-1]  # RGB -> BGR


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    for name, spec in PRESETS.items():
        img = make(*spec)
        cv2.imwrite(str(OUT / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 94])
        cv2.imwrite(str(THUMBS / f"{name}.jpg"), cv2.resize(img, (480, 270), interpolation=cv2.INTER_AREA),
                    [cv2.IMWRITE_JPEG_QUALITY, 88])
        print("✓", name)


if __name__ == "__main__":
    main()
