// Where each recording sits on the output canvas, and conversions between recording and
// canvas coordinates. Mirrors demorec/layout.py so the preview matches the render.
import { ASPECTS } from '../config/constants.js';
import { clamp } from '../utils/math.js';

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
export const cropOf = (clip) => ({ ...FULL_CROP, ...(clip.crop || {}) });
export const clipAspect = (inf, crop) => (crop.w * inf.width) / (crop.h * inf.height);

/** Output width / height (with 'auto' it follows the first clip's cropped recording). */
export function outputRatio(project, firstAspect) {
  if (project.background.type === 'none') return firstAspect;
  const a = project.output.aspect;
  if (a === 'auto') {
    const p = project.frame.padding, b = project.frame.bezel / 1920;
    return 1 / ((1 - 2 * p - 2 * b) / firstAspect + 2 * b + 2 * p);
  }
  return ASPECTS[a] || 16 / 9;
}

/**
 * A clip's placement on the canvas (stage px): the screen rect (x, y, iw, ih), glass rim b,
 * radius r, and the full uncropped recording's size/offset (lw, lh, lx, ly) inside the screen.
 */
export function cardGeometry(project, ow, oh, inf, crop) {
  const aspect = clipAspect(inf, crop);
  let g;
  if (project.background.type === 'none') g = { x: 0, y: 0, iw: ow, ih: oh, b: 0, r: 0 };
  else {
    const f = project.frame, k = ow / 1920, pad = f.padding * ow, b = Math.round(f.bezel * k);
    const iw = Math.min(ow - 2 * pad - 2 * b, (oh - 2 * pad - 2 * b) * aspect), ih = iw / aspect;
    g = { x: (ow - iw) / 2, y: (oh - ih) / 2, iw, ih, b, r: f.radius * k };
  }
  g.crop = crop;
  g.lw = g.iw / crop.w; g.lh = g.ih / crop.h;   // the whole recording, scaled
  g.lx = -crop.x * g.lw; g.ly = -crop.y * g.lh; // offset so the crop fills the screen
  return g;
}

/** Recording point (0..1 of the uncropped recording) <-> canvas px. */
export const recToCanvas = (g, u, v) => [g.x + g.lx + u * g.lw, g.y + g.ly + v * g.lh];
export const canvasToRec = (g, cx, cy) => [(cx - g.x - g.lx) / g.lw, (cy - g.y - g.ly) / g.lh];

/** Keep a zoom block's view inside the canvas. */
export function clampSegment(s, g, ow, oh) {
  const [cx, cy] = recToCanvas(g, s.x, s.y);
  const hw = ow / (2 * s.zoom), hh = oh / (2 * s.zoom);
  [s.x, s.y] = canvasToRec(g, clamp(cx, hw, ow - hw), clamp(cy, hh, oh - hh));
}
