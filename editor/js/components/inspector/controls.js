// Small form builders shared by the inspector panels.
import { actions } from '../../state/actions.js';
import { $ } from '../../utils/dom.js';

export const pct = (v) => Math.round(v * 100) + '%';

export function slider(id, label, min, max, step, value, fmt = (v) => v) {
  return `<div class="row"><label>${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="val" id="${id}V">${fmt(value)}</span></div>`;
}

export function bindSlider(id, fn, fmt = (v) => v) {
  const el = $('#' + id);
  if (el) el.oninput = () => { $('#' + id + 'V').textContent = fmt(+el.value); fn(+el.value); };
}

/** Style changes alter the layout (and so the camera paths): relayout and save. */
export const styleChanged = () => actions.changed({ relayout: true });
