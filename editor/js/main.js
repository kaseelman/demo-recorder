// Entry point: loads the project, connects the components and binds global controls.
//
//   config/       constants and presets
//   state/        store.js (the shared state) and actions.js (cross-component actions)
//   models/       pure logic, no DOM: timeline maths, canvas geometry, camera/transition motion
//   services/     server API, autosave, playback clock
//   components/   one folder per area of the screen: stage, timeline, inspector, selection-bar, header
//   controllers/  global input (keyboard)
//   utils/        dom, math and formatting helpers
import { bindHelp } from './components/header/help.js';
import { drawProjectControls, bindProjectControls } from './components/header/project-controls.js';
import { bindRenderButtons, poll } from './components/header/render-controls.js';
import { bindInspector, renderPanel } from './components/inspector/inspector.js';
import { drawSelectionBar } from './components/selection-bar/selection-bar.js';
import { drawStage, layoutStage, rebuildCards } from './components/stage/stage.js';
import { addZoom } from './components/timeline/timeline-actions.js';
import { bindTimeline, drawPlayhead, drawTimeline, followPlayhead, layoutTimeline } from './components/timeline/timeline-view.js';
import { bindKeyboard } from './controllers/keyboard.js';
import { computeTimeline } from './models/timeline.js';
import { api } from './services/api.js';
import { changed } from './services/autosave.js';
import { seek, togglePlay } from './services/playback.js';
import { actions } from './state/actions.js';
import { S, tagSegment } from './state/store.js';
import { $, $$ } from './utils/dom.js';

function update() {
  if (!S.project) return;
  drawStage();
  drawPlayhead();
}

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

Object.assign(actions, { layout, update, drawTimeline, drawSelectionBar, followPlayhead, renderPanel, rebuildCards, seek, select, changed });

async function load() {
  let pid = new URLSearchParams(location.search).get('project');
  try {
    if (!pid) {
      pid = (await api('/api/projects/new', {})).id;
      history.replaceState(null, '', '?project=' + pid);
    }
    $('#loading span').textContent = 'Preparing preview videos… the first open of a recording takes a few seconds';
    const st = await api('/api/state?project=' + encodeURIComponent(pid));
    Object.assign(S, { id: st.id, project: st.project, info: st.info, server: st });
    if (st.missing.length) alert(`These recordings could not be found and were skipped:\n${st.missing.join('\n')}`);
  } catch (e) {
    $('#loading').innerHTML = `<div id="error">${e.message}</div>`;
    return;
  }
  S.project.clips.forEach((c) => (c.segments || []).forEach(tagSegment));
  drawProjectControls();
  $('#loading').remove();
  rebuildCards();
  renderPanel();
  layout();
  poll();
}

$('#playBtn').onclick = togglePlay;
$('#addBtn').onclick = () => addZoom(S.t);
addEventListener('resize', layout);
bindProjectControls();
bindHelp();
bindKeyboard();
bindTimeline();
bindInspector();
bindRenderButtons();
load();
