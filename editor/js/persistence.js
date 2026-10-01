// Autosave: edits mark the project dirty; a debounced save writes project.json and pulls back
// fresh camera/cursor previews computed by the server (so the preview matches the render).
import { api } from './api.js';
import { app } from './app.js';
import { computeTimeline } from './model.js';
import { S } from './state.js';
import { $, toast } from './util.js';

let timer = null, inflight = null, cursorDirty = false;
const dirtyClips = new Set();

/**
 * @param {object} o
 * @param {boolean} [o.redraw=true]   redraw the timeline
 * @param {boolean} [o.relayout]      full relayout (geometry / clip list changed)
 * @param {string}  [o.clip]          this clip's zoom blocks changed -> refresh its camera path
 * @param {boolean} [o.cursor]        cursor smoothing changed -> refresh cursor paths
 */
export function changed({ redraw = true, relayout = false, clip = null, cursor = false } = {}) {
  if (clip) dirtyClips.add(clip);
  if (cursor) cursorDirty = true;
  if (relayout) app.layout();
  else if (redraw) {
    Object.assign(S, (({ entries, total }) => ({ timeline: entries, total }))(computeTimeline(S.project, S.info)));
    app.drawTimeline();
    app.update();
  }
  $('#saveState').textContent = 'Unsaved…';
  clearTimeout(timer);
  timer = setTimeout(save, 400);
}

export async function save() {
  clearTimeout(timer);
  timer = null;
  const project = JSON.parse(JSON.stringify(S.project, (k, v) => (k === '_id' ? undefined : v)));
  const body = { project, changed: [...dirtyClips], cursor_changed: cursorDirty };
  dirtyClips.clear();
  cursorDirty = false;
  $('#saveState').textContent = 'Saving…';
  inflight = api('/api/save', body)
    .then((r) => {
      for (const id in r.paths) if (S.info[id]) S.info[id].path = r.paths[id];
      for (const id in r.cursors) if (S.info[id]) S.info[id].cursor = r.cursors[id];
      app.update();
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
