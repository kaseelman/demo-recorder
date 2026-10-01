"""Where the cursor is, and whether a button is held, at any moment of a recording."""
import numpy as np

from .motion import gaussian_1d, smooth_damp


def _hold(events, ts):
    """The mouse sits still between events, so hold the last position instead of interpolating."""
    pos = [(e["t"], e["x"], e["y"]) for e in events if "x" in e]
    if not pos:
        return None
    et, ex, ey = (np.array(v, dtype=np.float64) for v in zip(*pos))
    idx = np.clip(np.searchsorted(et, ts, side="right") - 1, 0, len(et) - 1)
    return ex[idx], ey[idx]


def cursor_track(events, ts, smoothing, sample_rate, W, H, pin_clicks=True):
    """Smoothed cursor path sampled at times `ts`.

    `smoothing` is the Gaussian sigma in seconds: small values remove hand jitter, larger ones
    turn the path into gentle glides. Around clicks the path is pinned back to the real
    position, so the cursor always lands exactly on what was clicked.
    """
    held = _hold(events, ts)
    if held is None:
        return np.full(len(ts), W / 2), np.full(len(ts), H / 2)
    rx, ry = held
    sigma = smoothing * sample_rate
    x, y = gaussian_1d(rx, sigma), gaussian_1d(ry, sigma)
    if pin_clicks and sigma >= 0.5:
        w = np.zeros(len(ts))
        for e in events:
            if e["type"] == "down":
                w = np.maximum(w, np.exp(-0.5 * ((ts - e["t"]) / max(0.06, smoothing * 0.6)) ** 2))
        x, y = x * (1 - w) + rx * w, y * (1 - w) + ry * w
    return x, y


def press_track(events, ts, smooth_s, dt):
    """0..1 'button held' amount, eased so the click squash animates."""
    level, times, levels = 0, [-1e9], [0]
    for e in events:
        if e["type"] in ("down", "up"):
            level = max(0, level + (1 if e["type"] == "down" else -1))
            times.append(e["t"])
            levels.append(level)
    held = np.array(levels)[np.clip(np.searchsorted(times, ts, side="right") - 1, 0, None)] > 0
    out, v, cur = np.empty(len(ts)), 0.0, 0.0
    for i, h in enumerate(held):
        cur, v = smooth_damp(cur, 1.0 if h else 0.0, v, smooth_s, dt)
        out[i] = cur
    return out
