// Frame tab: padding, corners, glass rim, shadow.
import { S } from '../../state/store.js';
import { $ } from '../../utils/dom.js';
import { bindSlider, pct, slider, styleChanged } from './controls.js';

export function framePanel(p) {
  const f = S.project.frame;
  if (S.project.background.type === 'none') {
    p.innerHTML = '<section><p class="hint">Pick a background first: the frame only appears when the recording sits on a background.</p></section>';
    return;
  }
  p.innerHTML = `<section><h3>Layout</h3>${slider('fPad', 'Padding', 0, 0.2, 0.005, f.padding, pct)}${slider('fRad', 'Corners', 0, 40, 1, f.radius)}
      <p class="hint">To cut the menu bar or dock, select a clip in the timeline and press Crop.</p></section>
    <section><h3>Glass</h3>${slider('fBez', 'Rim', 0, 30, 1, f.bezel)}${slider('fGlass', 'Frost', 0, 0.8, 0.01, f.glass, pct)}
      <div class="row"><label>Edge lines</label><input type="checkbox" id="fStroke" ${f.stroke ? 'checked' : ''}></div>
      <p class="hint">Rim = thickness of the glass border, Frost = how white it is. Rim 0 gives a plain rounded window.</p></section>
    <section><h3>Shadow</h3>${slider('fShadow', 'Strength', 0, 1, 0.01, f.shadow, pct)}</section>`;
  bindSlider('fPad', (v) => { f.padding = v; styleChanged(); }, pct);
  bindSlider('fRad', (v) => { f.radius = v; styleChanged(); });
  bindSlider('fBez', (v) => { f.bezel = v; styleChanged(); });
  bindSlider('fGlass', (v) => { f.glass = v; styleChanged(); }, pct);
  bindSlider('fShadow', (v) => { f.shadow = v; styleChanged(); }, pct);
  $('#fStroke').onchange = (e) => { f.stroke = e.target.checked; styleChanged(); };
}
