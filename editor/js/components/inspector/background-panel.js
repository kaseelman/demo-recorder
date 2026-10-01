// Background tab: wallpapers, uploads, gradients, solid colours.
import { GRADIENTS, SOLIDS } from '../../config/constants.js';
import { actions } from '../../state/actions.js';
import { S } from '../../state/store.js';
import { $, $$ } from '../../utils/dom.js';
import { bindSlider, pct, slider, styleChanged } from './controls.js';

export function backgroundPanel(p) {
  const bg = S.project.background, kind = bg.type === 'radial' ? 'linear' : bg.type;
  let h = `<section><div class="seg" id="bgKind">${[['image', 'Image'], ['linear', 'Gradient'], ['solid', 'Color'], ['none', 'None']]
    .map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></section>`;
  if (bg.type === 'image') h += imageSection(bg);
  else if (bg.type === 'linear' || bg.type === 'radial') h += gradientSection(bg);
  else if (bg.type === 'solid') h += solidSection(bg);
  else h += '<section><p class="hint">No background: the recording fills the whole video, without a frame.</p></section>';
  p.innerHTML = h;

  const rerender = () => { actions.renderPanel(); styleChanged(); };
  $$('#bgKind button', p).forEach((b) => (b.onclick = () => {
    bg.type = b.dataset.k;
    if (bg.type === 'image' && !bg.image) bg.image = S.server.backgrounds.presets[0];
    rerender();
  }));
  $$('.thumb', p).forEach((t) => (t.onclick = () => { bg.image = t.dataset.img; rerender(); }));
  $$('.swatch[data-g]', p).forEach((s) => (s.onclick = () => { bg.colors = [...GRADIENTS[+s.dataset.g]]; rerender(); }));
  $$('.swatch[data-c]', p).forEach((s) => (s.onclick = () => { bg.color = s.dataset.c; rerender(); }));
  $$('#gradKind button', p).forEach((b) => (b.onclick = () => { bg.type = b.dataset.k; rerender(); }));
  $$('input[data-stop]', p).forEach((el) => (el.oninput = () => { bg.colors[+el.dataset.stop] = el.value; styleChanged(); }));
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('addStop', () => { bg.colors.push(bg.colors[bg.colors.length - 1]); rerender(); });
  on('rmStop', () => { bg.colors.pop(); rerender(); });
  on('uploadBtn', () => $('#fileInput').click());
  const sc = $('#solidColor');
  if (sc) sc.oninput = () => { bg.color = sc.value; styleChanged(); };
  bindSlider('bgBlur', (v) => { bg.blur = v; styleChanged(); });
  bindSlider('gAngle', (v) => { bg.angle = v; styleChanged(); }, (v) => v + '°');
  bindSlider('gCx', (v) => { bg.center[0] = v; styleChanged(); }, pct);
  bindSlider('gCy', (v) => { bg.center[1] = v; styleChanged(); }, pct);
}

function imageSection(bg) {
  const thumb = (path) => (path.startsWith('presets/') ? path.replace('presets/', 'thumbs/') : path);
  const tiles = (list, url) => list.map((x) => `<div class="thumb ${bg.image === x ? 'on' : ''}" data-img="${x}" style="background-image:url('/bg/${url(x)}')"></div>`).join('');
  const { presets, uploads } = S.server.backgrounds;
  return `<section><h3>Wallpapers</h3><div class="thumbs">${tiles(presets, thumb)}</div>
    ${uploads.length ? `<h3>Your images</h3><div class="thumbs">${tiles(uploads, (x) => x)}</div>` : ''}
    <button id="uploadBtn" style="width:100%;margin-bottom:12px">Upload image…</button>${slider('bgBlur', 'Blur', 0, 60, 1, bg.blur || 0)}</section>`;
}

function gradientSection(bg) {
  return `<section><h3>Presets</h3><div class="swatches">${GRADIENTS.map((g, i) => `<div class="swatch" data-g="${i}" style="background:linear-gradient(135deg, ${g.join(', ')})"></div>`).join('')}</div>
    <div class="row"><label>Style</label><div class="seg" id="gradKind" style="flex:1"><button data-k="linear" class="${bg.type === 'linear' ? 'on' : ''}">Linear</button><button data-k="radial" class="${bg.type === 'radial' ? 'on' : ''}">Radial</button></div></div>
    <div class="row"><label>Colors</label><div class="stops">${bg.colors.map((c, i) => `<input type="color" data-stop="${i}" value="${c}">`).join('')}
      ${bg.colors.length < 4 ? '<button id="addStop" title="Add a color">＋</button>' : ''}${bg.colors.length > 2 ? '<button id="rmStop" title="Remove last color">−</button>' : ''}</div></div>
    ${bg.type === 'linear' ? slider('gAngle', 'Angle', 0, 360, 1, bg.angle, (v) => v + '°')
      : slider('gCx', 'Center X', 0, 1, 0.01, bg.center[0], pct) + slider('gCy', 'Center Y', 0, 1, 0.01, bg.center[1], pct)}</section>`;
}

function solidSection(bg) {
  return `<section><h3>Color</h3><div class="swatches">${SOLIDS.map((c) => `<div class="swatch ${bg.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}</div>
    <div class="row"><label>Custom</label><input type="color" id="solidColor" value="${bg.color}"></div></section>`;
}
