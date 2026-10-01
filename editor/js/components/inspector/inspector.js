// The right-hand settings panel: tab switching and the image upload input.
import { uploadImage } from '../../services/api.js';
import { S } from '../../state/store.js';
import { $, $$, toast } from '../../utils/dom.js';
import { backgroundPanel } from './background-panel.js';
import { styleChanged } from './controls.js';
import { cursorPanel } from './cursor-panel.js';
import { framePanel } from './frame-panel.js';
import { outputPanel } from './output-panel.js';

const PANELS = { background: backgroundPanel, frame: framePanel, cursor: cursorPanel, output: outputPanel };
let tab = 'background';

export function renderPanel() {
  PANELS[tab]($('#panel'));
}

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
