// Cursor tab: style, size, smoothing, ripple, motion blur.
import { CURSORS } from '../../config/constants.js';
import { actions } from '../../state/actions.js';
import { S } from '../../state/store.js';
import { $, $$ } from '../../utils/dom.js';
import { cursorSVG } from '../stage/cursor-svg.js';
import { bindSlider, pct, slider, styleChanged } from './controls.js';

const smoothLabel = (v) => (v < 0.02 ? 'off' : v < 0.08 ? 'light' : v < 0.17 ? 'smooth' : 'silky');

export function cursorPanel(p) {
  const c = S.project.cursor;
  const tile = (style) => {
    const d = CURSORS[style], [, , w, h] = d.box;
    const icon = style === 'none' ? '<span style="position:static;color:#555;font-size:18px">∅</span>' : cursorSVG(style, Math.min(30 / w, 30 / h), false);
    return `<div class="cursor-tile ${c.style === style ? 'on' : ''}" data-style="${style}" title="${d.label}">${icon}<span>${d.label}</span></div>`;
  };
  p.innerHTML = `<section><h3>Cursor</h3><div class="cursor-tiles">${S.server.cursor_styles.map(tile).join('')}</div>
      ${slider('cSize', 'Size', 0.8, 3, 0.05, c.size, (v) => v.toFixed(1) + '×')}
      ${slider('cSmooth', 'Smoothing', 0, 0.3, 0.01, c.smoothing, smoothLabel)}
      <div class="row"><label>Click ripple</label><input type="checkbox" id="cRipple" ${c.ripple ? 'checked' : ''}></div>
      <p class="hint">Smoothing turns shaky hand movements into gentle glides. Clicks always land exactly where you clicked.</p></section>
    <section><h3>Motion</h3>${slider('mBlur', 'Motion blur', 0, 1, 0.05, S.project.motion_blur, pct)}
      <p class="hint">Blurs fast camera moves and quick cursor flicks. Around 25–40% keeps it subtle.</p></section>`;
  $$('.cursor-tile', p).forEach((t) => (t.onclick = () => { c.style = t.dataset.style; actions.renderPanel(); styleChanged(); }));
  bindSlider('cSize', (v) => { c.size = v; styleChanged(); }, (v) => v.toFixed(1) + '×');
  bindSlider('cSmooth', (v) => { c.smoothing = v; actions.changed({ redraw: false, cursor: true }); }, smoothLabel);
  $('#cRipple').onchange = (e) => { c.ripple = e.target.checked; actions.changed({ redraw: false }); };
  bindSlider('mBlur', (v) => { S.project.motion_blur = v; actions.changed({ redraw: false }); }, pct);
}
