// Entry point: loads the project, wires modules together and binds global controls.
//
// Module map
//   state.js          shared editor state           model.js        pure timeline/layout maths
//   api.js            server client                 persistence.js  autosave
//   stage.js          live preview of the canvas    aim.js          zoom-aiming frame
//   crop.js           crop tool                     timeline.js     timeline view + edits
//   selection-bar.js  context bar for selections    inspector.js    right-hand settings panel
//   playback.js       play/pause/seek clock         render-jobs.js  render buttons + progress
import { api } from './api.js';
import { app } from './app.js';
import { computeTimeline } from './model.js';
import { changed, flush } from './persistence.js';
import { pause, seek, togglePlay } from './playback.js';
import { bindInspector, renderPanel } from './inspector.js';
import { bindRenderButtons, poll } from './render-jobs.js';
import { drawSelectionBar } from './selection-bar.js';
import { layoutStage, rebuildCards, update } from './stage.js';
import { S, tagSegment } from './state.js';
import { addZoom, bindTimeline, deleteSelected, drawTimeline, layoutTimeline } from './timeline.js';
import { $, $$ } from './util.js';
import { endCrop } from './crop.js';

function layout() {
  if (!S.project) return;
  const { entries, total } = computeTimeline(S.project, S.info);
  S.timeline = entries;
  S.total = total;
  S.t = Math.min(S.t, total);
  layoutStage();
  layoutTimeline();
  update();
}

function select(sel, redraw = true) {
  S.sel = sel;
  if (redraw) drawTimeline();
  else {
    $$('.clip, .block, .trans').forEach((el) => el.classList.remove('sel'));
    const el = sel && (sel.kind === 'zoom' ? $(`.block[data-sid="${sel.sid}"]`) : $(`.${sel.kind === 'clip' ? 'clip' : 'trans'}[data-clip="${sel.clip}"]`));
    if (el) el.classList.add('sel');
    drawSelectionBar();
  }
  update();
}

Object.assign(app, { layout, update, drawTimeline, drawSelectionBar, renderPanel, rebuildCards, seek, select, changed });

async function load() {
  let pid = new URLSearchParams(location.search).get('project');
  try {
    if (!pid) {
      pid = (await api('/api/projects/new', {})).id;
      history.replaceState(null, '', '?project=' + pid);
    }
    $('#loading').textContent = 'Preparing preview videos… (the first open of a recording takes a few seconds)';
    const st = await api('/api/state?project=' + encodeURIComponent(pid));
    S.id = st.id;
    S.project = st.project;
    S.info = st.info;
    S.server = st;
    if (st.missing.length) alert(`These recordings could not be found and were skipped:\n${st.missing.join('\n')}`);
  } catch (e) {
    $('#loading').innerHTML = `<div id="error">${e.message}</div>`;
    return;
  }
  S.project.clips.forEach((c) => (c.segments || []).forEach(tagSegment));
  $('#projSelect').innerHTML = S.server.projects.map((p) => `<option value="${p.id}" ${p.id === S.id ? 'selected' : ''}>${p.title}</option>`).join('');
  $('#titleInput').value = S.project.title || '';
  $('#loading').remove();
  rebuildCards();
  renderPanel();
  layout();
  poll();
}

function bindHeader() {
  $('#playBtn').onclick = togglePlay;
  $('#addBtn').onclick = () => addZoom(S.t);
  $('#tlZoom').oninput = layout;
  $('#projSelect').onchange = async (e) => { await flush(); location.search = '?project=' + encodeURIComponent(e.target.value); };
  $('#titleInput').oninput = (e) => {
    S.project.title = e.target.value;
    const o = $(`#projSelect option[value="${S.id}"]`);
    if (o) o.textContent = S.project.title || S.id;
    changed({ redraw: false });
  };
  $('#newBtn').onclick = async () => { await flush(); location.search = '?project=' + (await api('/api/projects/new', {})).id; };
  addEventListener('resize', layout);
}

function bindKeyboard() {
  addEventListener('keydown', (e) => {
    const typing = e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type));
    if (!S.project || typing) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'z' || k === 'Z') addZoom(S.t);
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); deleteSelected(); }
    else if (k === 'Escape') { if (S.cropping) { endCrop(); drawSelectionBar(); } else select(null); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (S.playing) pause();
      seek(S.t + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30));
    }
  });
}

bindHeader();
bindKeyboard();
bindTimeline();
bindInspector();
bindRenderButtons();
load();
