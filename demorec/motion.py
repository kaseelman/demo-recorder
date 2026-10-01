"""Motion primitives: springs, zero-lag smoothing and easing."""
import math

import numpy as np


def smooth_damp(cur, target, vel, smooth_time, dt):
    """One step of a critically damped spring (no overshoot)."""
    omega = 2.0 / max(smooth_time, 1e-4)
    x = omega * dt
    decay = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
    change = cur - target
    temp = (vel + omega * change) * dt
    vel = (vel - omega * temp) * decay
    return target + (change + temp) * decay, vel


class Tween:
    """Eased moves of fixed duration that end exactly on target.

    Springs approach their target exponentially, so the camera keeps creeping at sub-pixel
    speed long after a move. That creep shimmers when resampled, which looks like shaking at
    the end of every zoom. A Tween instead plays a quintic curve that starts and ends with
    zero velocity and acceleration, then stops dead. When the target changes mid-move, the
    new move starts from the current velocity and acceleration, so motion never jolts.
    """

    def __init__(self, value, duration):
        self.value, self.duration = value, max(duration, 1e-3)
        self.target = value
        self.p0 = value
        self.v0 = self.a0 = 0.0
        self.t = self.duration  # not moving
        self.prev = [value, value]  # last two outputs, to estimate velocity/acceleration

    def step(self, target, dt):
        if abs(target - self.target) > 1e-9:
            v = (self.value - self.prev[1]) / dt
            a = (self.value - 2 * self.prev[1] + self.prev[0]) / (dt * dt)
            self.p0, self.v0, self.a0, self.target, self.t = self.value, v, a, target, 0.0
        self.t = min(self.t + dt, self.duration)
        s, T = self.t / self.duration, self.duration
        s3, s4, s5 = s ** 3, s ** 4, s ** 5
        h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5
        h1 = s - 6 * s3 + 8 * s4 - 3 * s5
        h2 = 0.5 * s * s - 1.5 * s3 + 1.5 * s4 - 0.5 * s5
        h5 = 10 * s3 - 15 * s4 + 6 * s5
        self.prev = [self.prev[1], self.value]
        self.value = h0 * self.p0 + h1 * T * self.v0 + h2 * T * T * self.a0 + h5 * self.target
        return self.value


def gaussian_1d(a, sigma):
    """Zero-phase Gaussian smoothing: removes jitter without making the signal lag."""
    if sigma < 0.5:
        return np.asarray(a, dtype=np.float64)
    r = int(3 * sigma) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(a, r, mode="edge"), k, mode="valid")


def ease_in_out(p):
    p = min(max(p, 0.0), 1.0)
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def ease_out(p):
    return 1 - (1 - min(max(p, 0.0), 1.0)) ** 3


def lerp_index(arrays, fi):
    """Linearly interpolate several equally sampled arrays at fractional index fi."""
    last = len(arrays[0]) - 1
    fi = min(max(fi, 0.0), last)
    i0 = int(math.floor(fi))
    i1, f = min(i0 + 1, last), fi - i0
    return tuple(a[i0] + (a[i1] - a[i0]) * f for a in arrays)
