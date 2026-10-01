import unittest

from demorec.layout import canvas_size, clip_layout
from demorec.project import new_project


class LayoutTest(unittest.TestCase):
    def setUp(self):
        self.project = new_project()

    def test_canvas_follows_aspect(self):
        self.assertEqual(canvas_size(self.project, 1.6, 1920), (1920, 1080))
        self.project["output"]["aspect"] = "1:1"
        self.assertEqual(canvas_size(self.project, 1.6, 1920), (1920, 1920))

    def test_crop_fills_frame_and_maps_both_ways(self):
        clip = {"crop": {"x": 0.0, "y": 0.1, "w": 1.0, "h": 0.8}}
        L = clip_layout(self.project, 1920, 1080, 3000, 2000, clip)
        self.assertAlmostEqual(L.iw / L.ih, (1.0 * 3000) / (0.8 * 2000), delta=0.01)
        # top-left of the crop lands on the frame's top-left corner
        self.assertEqual(L.to_canvas(0, 200), (L.x, L.y))
        cx, cy = L.to_canvas(1234.0, 987.0)
        rx, ry = L.to_recording(cx, cy)
        self.assertAlmostEqual(rx, 1234.0)
        self.assertAlmostEqual(ry, 987.0)

    def test_no_background_fills_canvas(self):
        self.project["background"]["type"] = "none"
        L = clip_layout(self.project, 1920, 1200, 3024, 1890, {})
        self.assertEqual((L.x, L.y, L.iw, L.ih), (0, 0, 1920, 1200))


if __name__ == "__main__":
    unittest.main()
