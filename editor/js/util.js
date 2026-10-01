// Small DOM and math helpers shared by every module.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export function fmt(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function easeInOut(p) {
  p = clamp(p, 0, 1);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}

/** Linear interpolation into an array sampled at `fps`. */
export function sampleAt(arr, fps, t) {
  const f = clamp(t * fps, 0, arr.length - 1), i = Math.floor(f), j = Math.min(i + 1, arr.length - 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

export const recLabel = (name) => name.split('/').pop().replace(/_/g, ' ');

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.opacity = 0), 2200);
}

/** Pointer-drag helper: calls move(ev) until the pointer is released, then up(ev). */
export function drag(move, up) {
  const mv = (ev) => move(ev);
  const u = (ev) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', u); up && up(ev); };
  addEventListener('pointermove', mv);
  addEventListener('pointerup', u);
}
