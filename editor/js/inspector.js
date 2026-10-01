// The right-hand panel: background, frame, cursor and output settings.
import { uploadImage } from './api.js';
import { app } from './app.js';
import { CURSORS, GRADIENTS, SOLIDS } from './constants.js';
import { S } from './state.js';
import { $, $$, toast } from './util.js';

let tab = 'background';
const pct = (v) => Math.round(v * 100) + '%';

function slider(id, label, min, max, step, value, fmt = (v) => v) {
  return `<div class="row"><label>${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="val" id="${id}V">${fmt(value)}</span></div>`;
}
function bind(id, fn, fmt = (v) => v) {
  const el = $('#' + id);
  if (el) el.oninput = () => { $('#' + id + 'V').textContent = fmt(+el.value); fn(+el.value); };
}
/** Style changes alter the layout (and therefore the camera paths), so relayout + save. */
const styleChanged = () => app.changed({ relayout: true });

export function bindInspector() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    tab = b.dataset.tab;
    $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderPanel();
  });
  $('#fileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const path = await uploadImage(file);
      S.server.backgrounds.uploads.push(path);
      S.project.background.image = path;
      renderPanel();
      styleChanged();
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };
}

export function renderPanel() {
  const panel = $('#panel');
  ({ background: backgroundPanel, frame: framePanel, cursor: cursorPanel, output: outputPanel })[tab](panel);
}

function backgroundPanel(p) {
  const bg = S.project.background, kind = bg.type === 'radial' ? 'linear' : bg.type;
  let h = `<section><div class="seg" id="bgKind">${[['image', 'Image'], ['linear', 'Gradient'], ['solid', 'Color'], ['none', 'None']]
    .map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></section>`;
  if (bg.type === 'image') {
    const thumb = (path) => (path.startsWith('presets/') ? path.replace('presets/', 'thumbs/') : path);
    const tiles = (list, url) => list.map((x) => `<div class="thumb ${bg.image === x ? 'on' : ''}" data-img="${x}" style="background-image:url('/bg/${url(x)}')"></div>`).join('');
    h += `<section><h3>Wallpapers</h3><div class="thumbs">${tiles(S.server.backgrounds.presets, thumb)}</div>`;
    if (S.server.backgrounds.uploads.length) h += `<h3>Your images</h3><div class="thumbs">${tiles(S.server.backgrounds.uploads, (x) => x)}</div>`;
    h += `<button id="uploadBtn" style="width:100%;margin-bottom:12px">Upload image…</button>${slider('bgBlur', 'Blur', 0, 60, 1, bg.blur || 0)}</section>`;
  } else if (bg.type === 'linear' || bg.type === 'radial') {
    h += `<section><h3>Presets</h3><div class="swatches">${GRADIENTS.map((g, i) => `<div class="swatch" data-g="${i}" style="background:linear-gradient(135deg, ${g.join(', ')})"></div>`).join('')}</div>
      <div class="row"><label>Style</label><div class="seg" id="gradKind" style="flex:1"><button data-k="linear" class="${bg.type === 'linear' ? 'on' : ''}">Linear</button><button data-k="radial" class="${bg.type === 'radial' ? 'on' : ''}">Radial</button></div></div>
      <div class="row"><label>Colors</label><div class="stops">${bg.colors.map((c, i) => `<input type="color" data-stop="${i}" value="${c}">`).join('')}
        ${bg.colors.length < 4 ? '<button id="addStop" title="Add a color">＋</button>' : ''}${bg.colors.length > 2 ? '<button id="rmStop" title="Remove last color">−</button>' : ''}</div></div>
      ${bg.type === 'linear' ? slider('gAngle', 'Angle', 0, 360, 1, bg.angle, (v) => v + '°')
        : slider('gCx', 'Center X', 0, 1, 0.01, bg.center[0], pct) + slider('gCy', 'Center Y', 0, 1, 0.01, bg.center[1], pct)}</section>`;
  } else if (bg.type === 'solid') {
    h += `<section><h3>Color</h3><div class="swatches">${SOLIDS.map((c) => `<div class="swatch ${bg.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}</div>
      <div class="row"><label>Custom</label><input type="color" id="solidColor" value="${bg.color}"></div></section>`;
  } else {
    h += '<section><p class="hint">No background: the recording fills the whole video, without a frame.</p></section>';
  }
  p.innerHTML = h;

  $$('#bgKind button', p).forEach((b) => (b.onclick = () => {
    bg.type = b.dataset.k;
    if (bg.type === 'image' && !bg.image) bg.image = S.server.backgrounds.presets[0];
    renderPanel(); styleChanged();
  }));
  $$('.thumb', p).forEach((t) => (t.onclick = () => { bg.image = t.dataset.img; renderPanel(); styleChanged(); }));
  $$('.swatch[data-g]', p).forEach((s) => (s.onclick = () => { bg.colors = [...GRADIENTS[+s.dataset.g]]; renderPanel(); styleChanged(); }));
  $$('.swatch[data-c]', p).forEach((s) => (s.onclick = () => { bg.color = s.dataset.c; renderPanel(); styleChanged(); }));
  $$('#gradKind button', p).forEach((b) => (b.onclick = () => { bg.type = b.dataset.k; renderPanel(); styleChanged(); }));
  $$('input[data-stop]', p).forEach((el) => (el.oninput = () => { bg.colors[+el.dataset.stop] = el.value; styleChanged(); }));
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('addStop', () => { bg.colors.push(bg.colors[bg.colors.length - 1]); renderPanel(); styleChanged(); });
  on('rmStop', () => { bg.colors.pop(); renderPanel(); styleChanged(); });
  on('uploadBtn', () => $('#fileInput').click());
  const sc = $('#solidColor'); if (sc) sc.oninput = () => { bg.color = sc.value; styleChanged(); };
  bind('bgBlur', (v) => { bg.blur = v; styleChanged(); });
  bind('gAngle', (v) => { bg.angle = v; styleChanged(); }, (v) => v + '°');
  bind('gCx', (v) => { bg.center[0] = v; styleChanged(); }, pct);
  bind('gCy', (v) => { bg.center[1] = v; styleChanged(); }, pct);
}

function framePanel(p) {
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
  bind('fPad', (v) => { f.padding = v; styleChanged(); }, pct);
  bind('fRad', (v) => { f.radius = v; styleChanged(); });
  bind('fBez', (v) => { f.bezel = v; styleChanged(); });
  bind('fGlass', (v) => { f.glass = v; styleChanged(); }, pct);
  bind('fShadow', (v) => { f.shadow = v; styleChanged(); }, pct);
  $('#fStroke').onchange = (e) => { f.stroke = e.target.checked; styleChanged(); };
}

function cursorPanel(p) {
  const c = S.project.cursor;
  const tile = (style) => {
    const d = CURSORS[style], [x, y, w, h] = d.box, u = Math.min(30 / w, 30 / h);
    return `<div class="cursor-tile ${c.style === style ? 'on' : ''}" data-style="${style}" title="${d.label}">
      ${style === 'none' ? '<span style="position:static;color:#555;font-size:18px">∅</span>' : `<svg viewBox="${d.box.join(' ')}" width="${w * u}" height="${h * u}">${d.svg}</svg>`}
      <span>${d.label}</span></div>`;
  };
  p.innerHTML = `<section><h3>Cursor</h3><div class="cursor-tiles">${S.server.cursor_styles.map(tile).join('')}</div>
      ${slider('cSize', 'Size', 0.8, 3, 0.05, c.size, (v) => v.toFixed(1) + '×')}
      ${slider('cSmooth', 'Smoothing', 0, 0.3, 0.01, c.smoothing, (v) => (v < 0.02 ? 'off' : v < 0.08 ? 'light' : v < 0.17 ? 'smooth' : 'silky'))}
      <div class="row"><label>Click ripple</label><input type="checkbox" id="cRipple" ${c.ripple ? 'checked' : ''}></div>
      <p class="hint">Smoothing turns shaky hand movements into gentle glides. Clicks always land exactly where you clicked.</p></section>
    <section><h3>Motion</h3>${slider('mBlur', 'Motion blur', 0, 1, 0.05, S.project.motion_blur, pct)}
      <p class="hint">Blurs fast camera moves and quick cursor flicks. Around 25–40% keeps it subtle.</p></section>`;
  $$('.cursor-tile', p).forEach((t) => (t.onclick = () => { c.style = t.dataset.style; renderPanel(); styleChanged(); }));
  bind('cSize', (v) => { c.size = v; styleChanged(); }, (v) => v.toFixed(1) + '×');
  bind('cSmooth', (v) => { c.smoothing = v; app.changed({ redraw: false, cursor: true }); },
    (v) => (v < 0.02 ? 'off' : v < 0.08 ? 'light' : v < 0.17 ? 'smooth' : 'silky'));
  $('#cRipple').onchange = (e) => { c.ripple = e.target.checked; app.changed({ redraw: false }); };
  bind('mBlur', (v) => { S.project.motion_blur = v; app.changed({ redraw: false }); }, pct);
}

function outputPanel(p) {
  const o = S.project.output;
  const names = { 3840: '4K', 2560: '1440p', 1920: '1080p', 1280: '720p' };
  p.innerHTML = `<section><h3>Aspect ratio</h3><div class="aspects">${['16:9', '16:10', '4:3', '1:1', '9:16', 'auto'].map((a) =>
      `<button data-a="${a}" class="${o.aspect === a ? 'on' : ''}">${a === 'auto' ? 'Fit recording' : a}</button>`).join('')}</div></section>
    <section><h3>Resolution</h3><div class="aspects">${[1280, 1920, 2560, 3840].map((w) =>
      `<button data-w="${w}" class="${o.width === w ? 'on' : ''}">${names[w]}</button>`).join('')}</div>
    <p class="hint" style="margin-top:10px">Width of the exported video. Preview renders are always half size.</p></section>`;
  $$('[data-a]', p).forEach((b) => (b.onclick = () => { o.aspect = b.dataset.a; renderPanel(); styleChanged(); }));
  $$('[data-w]', p).forEach((b) => (b.onclick = () => { o.width = +b.dataset.w; renderPanel(); app.changed({ redraw: false }); }));
}
