// DOM helpers.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

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
