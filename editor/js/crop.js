// Cropping a clip: a yellow box over the full recording. The cropped area fills the frame.
import { app } from './app.js';
import { clipById, S } from './state.js';
import { clamp, drag } from './util.js';

const MIN = 0.1;
const box = document.createElement('div');
box.id = 'cropBox';
const HANDLES = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
box.innerHTML = '<span class="tag">Crop</span>' +
  Object.entries(HANDLES).map(([c, [x, y]]) => `<i class="h" data-c="${c}" style="left:${x * 100}%;top:${y * 100}%"></i>`).join('');
let current = null;

export function startCrop(clipId) {
  S.cropping = clipId;
  const c = clipById(clipId);
  c.crop = { x: 0, y: 0, w: 1, h: 1, ...(c.crop || {}) };
  app.layout();
}

export function endCrop() {
  if (!S.cropping) return;
  S.cropping = null;
  app.changed({ relayout: true });
}

/** Quick presets: macOS menu bar is ~25pt (37pt with a notch) of a ~980pt-tall screen. */
export function applyCropPreset(name) {
  const c = clipById(S.cropping);
  if (name === 'menubar' && c.crop.y < 0.035) { c.crop.h -= 0.035 - c.crop.y; c.crop.y = 0.035; }
  if (name === 'dock') c.crop.h = Math.min(c.crop.h, 0.93 - c.crop.y);  // dock ≈ 70pt
  if (name === 'reset') c.crop = { x: 0, y: 0, w: 1, h: 1 };
  app.update();
}

export function drawCropBox(card) {
  current = card;
  if (!card || !S.cropping) { box.style.display = 'none'; return; }
  if (box.parentElement !== card.screen) card.screen.appendChild(box);
  const c = clipById(S.cropping).crop, g = card.g;
  Object.assign(box.style, { display: 'block', left: c.x * g.iw + 'px', top: c.y * g.ih + 'px', width: c.w * g.iw + 'px', height: c.h * g.ih + 'px' });
}

box.addEventListener('pointerdown', (e) => {
  if (!current) return;
  e.preventDefault();
  e.stopPropagation();
  const c = clipById(S.cropping).crop, g = current.g, mode = e.target.dataset.c || 'move';
  const x0 = e.clientX, y0 = e.clientY, c0 = { ...c };
  drag((ev) => {
    const dx = (ev.clientX - x0) / g.iw, dy = (ev.clientY - y0) / g.ih;
    if (mode === 'move') {
      c.x = clamp(c0.x + dx, 0, 1 - c0.w);
      c.y = clamp(c0.y + dy, 0, 1 - c0.h);
    } else {
      let x1 = c0.x, y1 = c0.y, x2 = c0.x + c0.w, y2 = c0.y + c0.h;
      if (mode.includes('w')) x1 = clamp(c0.x + dx, 0, x2 - MIN);
      if (mode.includes('e')) x2 = clamp(x2 + dx, x1 + MIN, 1);
      if (mode.includes('n')) y1 = clamp(c0.y + dy, 0, y2 - MIN);
      if (mode.includes('s')) y2 = clamp(y2 + dy, y1 + MIN, 1);
      Object.assign(c, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    drawCropBox(current);
  });
});
