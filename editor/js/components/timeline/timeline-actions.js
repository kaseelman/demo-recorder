// Edits made from the timeline: add/delete zooms, reorder/remove clips.
import { MIN_BLOCK } from '../../config/constants.js';
import { clampSegment } from '../../models/geometry.js';
import { activeAt, localTime } from '../../models/timeline.js';
import { actions } from '../../state/actions.js';
import { S, clipById, tagSegment } from '../../state/store.js';
import { toast } from '../../utils/dom.js';
import { sampleAt } from '../../utils/math.js';
import { cardFor } from '../stage/stage.js';

/** Add a zoom block at project time t, aimed at the next nearby click (or the cursor). */
export function addZoom(t) {
  const act = activeAt(S.timeline, S.total, t);
  if (!act.length) return toast('Add a recording first');
  const e = act.length > 1 && (t - act[1].start) / act[1].d > 0.5 ? act[1] : act[0];
  const c = e.clip, inf = S.info[c.id], lt = localTime(e, t);
  c.segments = c.segments || [];
  const sorted = [...c.segments].sort((a, b) => a.start - b.start);
  if (sorted.some((s) => lt >= s.start && lt < s.end)) return toast('There is already a zoom here');
  const hi = Math.min((sorted.find((s) => s.start > lt) || { start: inf.duration }).start, inf.duration - c.trim_end);
  const end = Math.min(lt + 2.5, hi);
  if (end - lt < MIN_BLOCK) return toast('No room for a zoom here');
  const k = inf.clicks.find((k) => k.t >= lt - 0.5 && k.t <= end);
  const s = tagSegment({ start: lt, end, zoom: S.server.defaults.zoom, follow: false,
    x: k ? k.x : sampleAt(inf.cursor.x, inf.cursor.fps, lt), y: k ? k.y : sampleAt(inf.cursor.y, inf.cursor.fps, lt) });
  clampSegment(s, cardFor(c.id).g, S.stage.w, S.stage.h);
  c.segments.push(s);
  S.sel = { kind: 'zoom', clip: c.id, sid: s._id };
  actions.changed();
}

export function deleteSelected() {
  if (!S.sel) return;
  if (S.sel.kind === 'zoom') {
    const c = clipById(S.sel.clip);
    c.segments = c.segments.filter((s) => s._id !== S.sel.sid);
    S.sel = null;
    actions.changed();
  } else if (S.sel.kind === 'clip') removeClip(S.sel.clip);
}

export function removeClip(id) {
  if (!confirm('Remove this recording from the project? (The recording itself is kept.)')) return;
  S.project.clips = S.project.clips.filter((c) => c.id !== id);
  S.sel = null;
  actions.rebuildCards();
  actions.changed({ relayout: true });
}

export function moveClip(id, dir) {
  const clips = S.project.clips, i = clips.findIndex((c) => c.id === id), j = i + dir;
  if (j < 0 || j >= clips.length) return;
  [clips[i], clips[j]] = [clips[j], clips[i]];
  actions.changed({ relayout: true });
}
