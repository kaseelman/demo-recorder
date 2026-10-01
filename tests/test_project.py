import unittest

from demorec.project import new_project, timeline, with_defaults


class TimelineTest(unittest.TestCase):
    def test_transitions_overlap_neighbouring_clips(self):
        p = new_project()
        p["clips"] = [{"trim_start": 0, "trim_end": 0},
                      {"trim_start": 1, "trim_end": 0, "transition": {"type": "crossfade", "duration": 0.5}}]
        starts, lengths, trans, total = timeline(p, [10.0, 6.0], 60)
        self.assertEqual(lengths, [600, 300])
        self.assertEqual(starts, [0, 570])           # starts 0.5s (30 frames) before clip 1 ends
        self.assertEqual(trans[1], ("crossfade", 30))
        self.assertEqual(total, 870)

    def test_cut_has_no_overlap(self):
        p = new_project()
        p["clips"] = [{}, {"transition": {"type": "cut", "duration": 0.5}}]
        starts, _, trans, total = timeline(p, [2.0, 2.0], 30)
        self.assertEqual(starts, [0, 60])
        self.assertEqual(trans[1], ("cut", 0))

    def test_old_projects_get_new_defaults(self):
        p = with_defaults({"title": "old", "frame": {"radius": 25}})
        self.assertEqual(p["frame"]["radius"], 25)
        self.assertIn("cursor", p)
        self.assertEqual(p["clips"], [])


if __name__ == "__main__":
    unittest.main()
