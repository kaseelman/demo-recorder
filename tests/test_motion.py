import unittest

import numpy as np

from demorec.motion import Tween, gaussian_1d


class TweenTest(unittest.TestCase):
    def run_tween(self, targets, duration=1.0, rate=480):
        tw = Tween(targets[0], duration)
        return np.array([tw.step(t, 1 / rate) for t in targets])

    def test_lands_exactly_on_target_without_overshoot(self):
        xs = self.run_tween([100.0] * 700)
        self.assertAlmostEqual(xs[479], 100.0)       # done after exactly one duration
        self.assertTrue(np.all(xs[480:] == 100.0))   # and then stops dead: no creeping
        self.assertLessEqual(xs.max(), 100.0)        # never overshoots
        self.assertTrue(np.all(np.diff(xs) >= 0))    # monotonic

    def test_retarget_keeps_motion_continuous(self):
        xs = self.run_tween([100.0] * 240 + [40.0] * 660)
        v = np.diff(xs)
        self.assertLess(np.abs(np.diff(v)).max(), 0.05)  # no velocity jump when the target changes
        self.assertAlmostEqual(xs[-1], 40.0)


class SmoothingTest(unittest.TestCase):
    def test_gaussian_has_no_lag(self):
        step = np.r_[np.zeros(100), np.ones(100)]
        out = gaussian_1d(step, 5)
        self.assertAlmostEqual(out[99] + out[100], 1.0, places=6)  # symmetric around the edge


if __name__ == "__main__":
    unittest.main()
