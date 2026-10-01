// Pure project logic (no DOM): timeline placement, time mapping, layout geometry, transitions.
// The maths mirrors demorec/project.py and demorec/compose.py so the preview matches the render.
import { ASPECTS } from './constants.js';
import { clamp, easeInOut } from './util.js';

/** Place clips on the project timeline; transitions overlap the end of the previous clip. */
export function computeTimeline(project, info) {
  let cur = 0, prevLen = 0;
  const entries = project.clips.map((clip, i) => {
    const len = Math.max(0.1, info[clip.id].duration - clip.trim_start - clip.trim_end);
    let d = 0;
    if (i > 0 && clip.transition && clip.transition.type !== 'cut') d = Math.min(clip.transition.duration, len / 2, prevLen / 2);
    cur -= d;
    const e = { clip, i, start: cur, len, d };
    cur += len;
    prevLen = len;
    return e;
  });
  return { entries, total: cur };
}

export const localTime = (e, t) => t - e.start + e.clip.trim_start;     // project time -> recording time
export const globalTime = (e, lt) => e.start + lt - e.clip.trim_start;  // recording time -> project time

export function activeAt(entries, total, t) {
  const act = entries.filter((e) => t >= e.start && t < e.start + e.len);
  if (!act.length && entries.length && t >= total - 1e-6) act.push(entries[entries.length - 1]);
  return act;
}

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
 * Where a clip sits on the canvas (stage px): the screen rect (x, y, iw, ih), glass rim b,
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

/** Camera midway through a transition: zoom blends in log space. */
export function blendCameras(a, b, e) {
  return { z: Math.exp(Math.log(a.z) * (1 - e) + Math.log(b.z) * e), x: a.x * (1 - e) + b.x * e, y: a.y * (1 - e) + b.y * e };
}

/** Transform of the outgoing (a) and incoming (b) clip at progress p of a transition. */
export function transitionPose(kind, p, ow, oh) {
  const e = easeInOut(p);
  const a = { dx: 0, dy: 0, s: 1, o: 1 }, b = { dx: 0, dy: 0, s: 1, o: 1 };
  if (kind === 'slide-left') { a.dx = -e * ow; b.dx = (1 - e) * ow; }
  else if (kind === 'slide-up') { a.dy = -e * oh; b.dy = (1 - e) * oh; }
  else if (kind === 'scale') { a.s = 1 - 0.06 * e; a.o = 1 - e; b.s = 1.06 - 0.06 * e; b.o = e; }
  else b.o = e;  // crossfade
  return { a, b };
}

export function backgroundCSS(bg) {
  const stops = (bg.colors || []).join(', ');
  if (bg.type === 'image') return `url("/bg/${bg.image}") center / cover`;
  if (bg.type === 'linear') return `linear-gradient(${bg.angle}deg, ${stops})`;
  if (bg.type === 'radial') return `radial-gradient(circle farthest-corner at ${bg.center[0] * 100}% ${bg.center[1] * 100}%, ${stops})`;
  if (bg.type === 'solid') return bg.color;
  return '#000';
}
