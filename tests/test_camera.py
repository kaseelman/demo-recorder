import unittest

from demorec.camera import plan_focuses, segments_from_json, segments_to_json
from demorec.config import DEFAULTS
from demorec.layout import clip_layout
from demorec.project import new_project


def click(t, x, y):
    return [{"t": t, "type": "down", "x": x, "y": y, "button": 0}, {"t": t + 0.1, "type": "up", "x": x, "y": y, "button": 0}]


class PlanTest(unittest.TestCase):
    def test_nearby_clicks_share_a_zoom_and_far_ones_do_not(self):
        events = click(1.0, 500, 500) + click(1.8, 600, 520) + click(9.0, 1500, 900)
        segs = plan_focuses(events, DEFAULTS["zoom"], 1920, 1080, 120)
        self.assertEqual(len(segs), 2)
        self.assertEqual(len(segs[0].points), 2)
        self.assertLess(segs[0].start, 1.0)  # starts moving before the first click
        self.assertLessEqual(max(s.zoom for s in segs), DEFAULTS["zoom"]["max_zoom"])

    def test_segments_round_trip_through_json(self):
        L = clip_layout(new_project(), 1920, 1080, 3024, 1964, {"crop": {"y": 0.05, "h": 0.9}})
        segs = plan_focuses(click(2.0, 900, 600), DEFAULTS["zoom"], L.ow, L.oh, 100)
        back = segments_from_json(segments_to_json(segs, L), [], L)
        self.assertAlmostEqual(back[0].cx, segs[0].cx, delta=1)
        self.assertAlmostEqual(back[0].cy, segs[0].cy, delta=1)
        self.assertAlmostEqual(back[0].zoom, segs[0].zoom, places=2)


if __name__ == "__main__":
    unittest.main()
