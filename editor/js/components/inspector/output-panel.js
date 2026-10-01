// Output tab: aspect ratio and resolution.
import { actions } from '../../state/actions.js';
import { S } from '../../state/store.js';
import { $$ } from '../../utils/dom.js';
import { styleChanged } from './controls.js';

const RESOLUTIONS = { 1280: '720p', 1920: '1080p', 2560: '1440p', 3840: '4K' };

export function outputPanel(p) {
  const o = S.project.output;
  p.innerHTML = `<section><h3>Aspect ratio</h3><div class="aspects">${['16:9', '16:10', '4:3', '1:1', '9:16', 'auto'].map((a) =>
      `<button data-a="${a}" class="${o.aspect === a ? 'on' : ''}">${a === 'auto' ? 'Fit recording' : a}</button>`).join('')}</div></section>
    <section><h3>Resolution</h3><div class="aspects">${Object.entries(RESOLUTIONS).map(([w, name]) =>
      `<button data-w="${w}" class="${o.width === +w ? 'on' : ''}">${name}</button>`).join('')}</div>
    <p class="hint" style="margin-top:10px">Width of the exported video. Preview renders are always half size.</p></section>`;
  $$('[data-a]', p).forEach((b) => (b.onclick = () => { o.aspect = b.dataset.a; actions.renderPanel(); styleChanged(); }));
  $$('[data-w]', p).forEach((b) => (b.onclick = () => { o.width = +b.dataset.w; actions.renderPanel(); actions.changed({ redraw: false }); }));
}
