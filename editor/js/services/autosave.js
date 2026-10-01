// Autosave: edits mark the project dirty; a debounced save writes project.json and pulls back
// fresh camera/cursor previews computed by the server (so the preview matches the render).
import { actions } from '../state/actions.js';
import { S } from '../state/store.js';
import { computeTimeline } from '../models/timeline.js';
import { $, toast } from '../utils/dom.js';
import { api } from './api.js';

let timer = null, inflight = null, cursorDirty = false;

/**
 * @param {object} o
 * @param {boolean} [o.redraw=true]   redraw the timeline
 * @param {boolean} [o.relayout]      full relayout (geometry / clip list changed)
 * @param {boolean} [o.cursor]        cursor smoothing changed -> refresh cursor paths
 */
export function changed({ redraw = true, relayout = false, cursor = false } = {}) {
  if (cursor) cursorDirty = true;
  if (relayout) actions.layout();
  else if (redraw) {
    const { entries, total } = computeTimeline(S.project, S.info);
    S.timeline = entries;
    S.total = total;
    actions.drawTimeline();
    actions.update();
  }
  $('#saveState').textContent = 'Unsaved…';
  clearTimeout(timer);
  timer = setTimeout(save, 400);
}

export async function save() {
  clearTimeout(timer);
  timer = null;
  const project = JSON.parse(JSON.stringify(S.project, (k, v) => (k === '_id' ? undefined : v)));
  const body = { project, cursor_changed: cursorDirty };
  cursorDirty = false;
  $('#saveState').textContent = 'Saving…';
  inflight = api('/api/save', body)
    .then((r) => {
      for (const id in r.paths) if (S.info[id]) S.info[id].path = r.paths[id];
      for (const id in r.cursors) if (S.info[id]) S.info[id].cursor = r.cursors[id];
      actions.update();
      $('#saveState').textContent = 'Saved';
    })
    .catch((e) => { $('#saveState').textContent = 'Save failed'; toast(e.message); });
  await inflight;
}

/** Make sure nothing is pending (before switching project or rendering). */
export async function flush() {
  if (timer) await save();
  else if (inflight) await inflight;
}
