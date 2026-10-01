// The context bar under the stage: edit whatever is selected (zoom block, clip or transition).
import { MAX_ZOOM, TRANSITION_LABELS } from '../../config/constants.js';
import { actions } from '../../state/actions.js';
import { S, clipById, entryOf, selectedSegment } from '../../state/store.js';
import { $, $$ } from '../../utils/dom.js';
import { recLabel } from '../../utils/format.js';
import { setZoom, syncZoomLabels } from '../stage/aim-frame.js';
import { applyCropPreset, endCrop, startCrop } from '../stage/crop-box.js';
import { deleteSelected, moveClip, removeClip } from '../timeline/timeline-actions.js';

export function drawSelectionBar() {
  const bar = $('#selBar'), sel = S.sel;
  if (S.cropping) return drawCropBar(bar);
  if (!sel) { bar.innerHTML = '<span>Tip: click a zoom, clip or transition to edit it</span>'; return; }
  if (sel.kind === 'zoom') drawZoomBar(bar);
  else if (sel.kind === 'clip') drawClipBar(bar);
  else if (sel.kind === 'trans') drawTransitionBar(bar);
}

function drawZoomBar(bar) {
  const s = selectedSegment();
  if (!s) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<b>Zoom</b>
    <label>Level <input id="zoomRange" type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="${s.zoom}" style="width:110px">
      <span id="zoomVal" style="font:12px ui-monospace,Menlo,monospace;min-width:40px">${s.zoom.toFixed(2)}×</span></label>
    <label title="While zoomed, pan along when the cursor nears the edge"><input id="followChk" type="checkbox" ${s.follow ? 'checked' : ''}> Follow cursor</label>
    <button id="delBtn">Delete</button>`;
  $('#zoomRange').oninput = (e) => { setZoom(s, +e.target.value); syncZoomLabels(s); actions.update(); actions.changed({ redraw: false }); };
  $('#zoomRange').onchange = () => actions.drawTimeline();
  $('#followChk').onchange = (e) => { s.follow = e.target.checked; actions.changed(); };
  $('#delBtn').onclick = deleteSelected;
}

function drawClipBar(bar) {
  const c = clipById(S.sel.clip);
  if (!c) { bar.innerHTML = ''; return; }
  const i = S.project.clips.indexOf(c), crop = c.crop || {};
  const cropped = crop.x || crop.y || (crop.w && crop.w < 1) || (crop.h && crop.h < 1);
  bar.innerHTML = `<b>Clip ${i + 1}</b><span>${recLabel(c.recording)}</span>
    <button id="cropBtn" title="Cut away the menu bar, dock or anything else">${cropped ? 'Edit crop' : 'Crop…'}</button>
    <button id="mvL" ${i === 0 ? 'disabled' : ''}>◀ Move</button><button id="mvR" ${i === S.project.clips.length - 1 ? 'disabled' : ''}>Move ▶</button>
    <button id="rmClip">Remove</button>`;
  $('#cropBtn').onclick = () => { const en = entryOf(c.id); if (S.t < en.start || S.t >= en.start + en.len) actions.seek(en.start + 0.1); startCrop(c.id); drawSelectionBar(); };
  $('#mvL').onclick = () => moveClip(c.id, -1);
  $('#mvR').onclick = () => moveClip(c.id, 1);
  $('#rmClip').onclick = () => removeClip(c.id);
}

function drawCropBar(bar) {
  bar.innerHTML = `<b>Crop</b>
    <button data-p="menubar" title="Cut the macOS menu bar">Hide menu bar</button>
    <button data-p="dock" title="Cut the Dock at the bottom">Hide dock</button>
    <button data-p="reset">Reset</button>
    <button id="cropDone" class="primary">Done</button>`;
  $$('[data-p]', bar).forEach((b) => (b.onclick = () => applyCropPreset(b.dataset.p)));
  $('#cropDone').onclick = () => { endCrop(); drawSelectionBar(); };
}

function drawTransitionBar(bar) {
  const c = clipById(S.sel.clip);
  if (!c) { bar.innerHTML = ''; return; }
  c.transition = c.transition || { type: 'crossfade', duration: 0.6 };
  const tr = c.transition;
  bar.innerHTML = `<b>Transition</b>
    <div class="seg" id="transSeg">${S.server.transitions.map((t) => `<button data-t="${t}" class="${tr.type === t ? 'on' : ''}">${TRANSITION_LABELS[t]}</button>`).join('')}</div>
    <label>Duration <input id="transDur" type="range" min="0.2" max="2" step="0.05" value="${tr.duration}" style="width:100px" ${tr.type === 'cut' ? 'disabled' : ''}>
      <span id="transVal" style="font:12px ui-monospace,Menlo,monospace">${tr.duration.toFixed(2)}s</span></label>`;
  $$('#transSeg button', bar).forEach((b) => (b.onclick = () => {
    tr.type = b.dataset.t;
    actions.changed({ relayout: true });
    actions.seek(Math.max(0, entryOf(c.id).start - 0.4));
  }));
  $('#transDur').oninput = (e) => { tr.duration = +e.target.value; $('#transVal').textContent = tr.duration.toFixed(2) + 's'; actions.changed({ relayout: true }); };
}
