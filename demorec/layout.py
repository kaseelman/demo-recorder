"""Where each recording sits on the output canvas.

The canvas is the whole output picture: background + glass frame + recording. The camera
pans and zooms across this canvas (zoom 1 = the full canvas). Each clip may be cropped
(to cut away the menu bar or dock); the cropped area fills the clip's frame.

Pixel sizes in a project's style (radius, bezel) are defined for a 1920px-wide canvas.
"""
from dataclasses import dataclass

ASPECTS = {"16:9": 16 / 9, "16:10": 16 / 10, "4:3": 4 / 3, "1:1": 1.0, "9:16": 9 / 16}
FULL_CROP = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
REFERENCE_WIDTH = 1920  # canvas size used for planning and for the editor's numbers


def even(v):
    return max(2, int(round(v / 2)) * 2)


def crop_of(clip):
    c = {**FULL_CROP, **(clip.get("crop") or {})}
    c["w"] = min(max(c["w"], 0.05), 1 - c["x"])
    c["h"] = min(max(c["h"], 0.05), 1 - c["y"])
    return c


def clip_aspect(rec_w, rec_h, crop):
    return (crop["w"] * rec_w) / (crop["h"] * rec_h)


def is_plain(project):
    return project["background"].get("type") == "none"


def canvas_size(project, first_aspect, width):
    """Output size for a canvas `width` px wide."""
    ow = even(width)
    aspect = project["output"].get("aspect", "16:9")
    if is_plain(project):
        return ow, even(ow / first_aspect)
    if aspect == "auto":
        pad, b = project["frame"]["padding"] * ow, project["frame"]["bezel"] * ow / REFERENCE_WIDTH
        return ow, even((ow - 2 * pad - 2 * b) / first_aspect + 2 * b + 2 * pad)
    return ow, even(ow / ASPECTS.get(aspect, 16 / 9))


@dataclass
class ClipLayout:
    """A clip's placement on a canvas of ow x oh px, for a recording of W x H px (working res)."""
    ow: int
    oh: int
    x: int        # screen (cropped recording) rectangle on the canvas
    y: int
    iw: int
    ih: int
    b: int        # glass rim thickness
    r: float      # corner radius of the screen
    W: int
    H: int
    crop: dict

    @property
    def scale(self):
        """Canvas px per recording px."""
        return self.iw / (self.crop["w"] * self.W)

    def to_canvas(self, px, py):
        s = self.scale
        return self.x + (px - self.crop["x"] * self.W) * s, self.y + (py - self.crop["y"] * self.H) * s

    def to_recording(self, cx, cy):
        s = self.scale
        return (cx - self.x) / s + self.crop["x"] * self.W, (cy - self.y) / s + self.crop["y"] * self.H

    def scaled(self, n):
        """The same layout on a canvas n times larger."""
        return ClipLayout(self.ow * n, self.oh * n, self.x * n, self.y * n, self.iw * n, self.ih * n,
                          self.b * n, self.r * n, self.W, self.H, self.crop)

    def rec_matrix(self):
        """2x3 affine: recording px -> canvas px."""
        s = self.scale
        return [[s, 0, self.x - self.crop["x"] * self.W * s], [0, s, self.y - self.crop["y"] * self.H * s]]


def clip_layout(project, ow, oh, W, H, clip):
    """Fit the clip's cropped recording inside the canvas, leaving the frame's padding."""
    crop = crop_of(clip)
    aspect = clip_aspect(W, H, crop)
    if is_plain(project):
        return ClipLayout(ow, oh, 0, 0, ow, oh, 0, 0.0, W, H, crop)
    f, k = project["frame"], ow / REFERENCE_WIDTH
    pad, b = f["padding"] * ow, round(f["bezel"] * k)
    aw, ah = ow - 2 * pad - 2 * b, oh - 2 * pad - 2 * b
    iw = min(aw, ah * aspect)
    iw, ih = even(iw), even(iw / aspect)
    return ClipLayout(ow, oh, (ow - iw) // 2, (oh - ih) // 2, iw, ih, b, f["radius"] * k, W, H, crop)


def project_canvas(project, first_rec, width=REFERENCE_WIDTH):
    """Canvas size; with 'auto' aspect it follows the first clip's (cropped) recording."""
    crop = crop_of(project["clips"][0]) if project["clips"] else FULL_CROP
    return canvas_size(project, clip_aspect(first_rec.W0, first_rec.H0, crop), width)
