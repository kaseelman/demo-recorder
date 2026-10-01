// The timeline: ruler, clip lane (with transitions and the ＋ placeholder), zoom lane, clicks.
import { api } from './api.js';
import { app } from './app.js';
import { MIN_BLOCK, TL_PAD, TRANSITION_LABELS } from './constants.js';
import { activeAt, clampSegment, globalTime, localTime } from './model.js';
import { S, clipById, entryOf, tagSegment } from './state.js';
import { $, $$, clamp, drag, fmt, recLabel, sampleAt, toast } from './util.js';
import { cardFor } from './stage.js';

export const timelineX = (t) => TL_PAD + t * S.pxPerSec;
const timeAt = (clientX) => Math.max(0, (clientX - $('#tlInner').getBoundingClientRect().left - TL_PAD) / S.pxPerSec);

export function layoutTimeline() {
  const sc = $('#tlScroll'), span = Math.max(S.total, 5);
  S.pxPerSec = ((sc.clientWidth - TL_PAD * 2 - 170) / span) * +$('#tlZoom').value;
  $('#tlInner').style.width = span * S.pxPerSec + TL_PAD * 2 + 180 + 'px';
  drawRuler();
  drawTimeline();
}

function drawRuler() {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const step = steps.find((s) => s * S.pxPerSec >= 70) || 300, span = Math.max(S.total, 5);
  let h = '';
  for (let t = 0; t <= span + 1e-6; t += step) {
    h += `<div class="tick" style="left:${timelineX(t)}px">${fmt(t).replace(/\.0$/, '')}</div>`;
    for (let k = 1; k < 5; k++) if (t + (k * step) / 5 < span) h += `<div class="tick minor" style="left:${timelineX(t + (k * step) / 5)}px"></div>`;
  }
  $('#ruler').innerHTML = h;
}

const isSel = (kind, clip, sid) => S.sel && S.sel.kind === kind && S.sel.clip === clip && (sid === undefined || S.sel.sid === sid);

export function drawTimeline() {
  const pps = S.pxPerSec;
  let vh = '', zh = `<div class="lanebg" style="left:${timelineX(0)}px;width:${S.total * pps}px"></div>`, ch = '';
  for (const e of S.timeline) {
    const c = e.clip, inf = S.info[c.id], w = e.len * pps;
    vh += `<div class="clip ${e.i % 2 ? 'alt' : ''} ${isSel('clip', c.id) ? 'sel' : ''}" data-clip="${c.id}" style="left:${timelineX(e.start)}px;width:${w}px;z-index:${e.i + 1}">
      ${w > 70 ? `<span class="name">${e.i + 1} · ${recLabel(c.recording)}</span>` : ''}${w > 190 ? `<span class="dur">${fmt(e.len)}</span>` : ''}
      <div class="edge l"></div><div class="edge r"></div></div>`;
    if (e.i > 0) {
      const kind = e.d > 0 ? c.transition.type : 'cut';
      if (e.d > 0) vh += `<div class="overlap" style="left:${timelineX(e.start)}px;width:${e.d * pps}px"></div>`;
      vh += `<div class="trans ${isSel('trans', c.id) ? 'sel' : ''}" data-clip="${c.id}" style="left:${timelineX(e.start + e.d / 2)}px" title="Transition">${TRANSITION_LABELS[kind]}</div>`;
    }
    // Zoom blocks are stored in recording time and shown in project time.
    const vis0 = c.trim_start, vis1 = inf.duration - c.trim_end;
    for (const s of c.segments || []) {
      const a = Math.max(s.start, vis0), b = Math.min(s.end, vis1);
      if (b - a <= 0.01) continue;
      const bw = (b - a) * pps, ramp = Math.min(bw / 2, 0.7 * pps);
      zh += `<div class="block ${isSel('zoom', c.id, s._id) ? 'sel' : ''}" data-clip="${c.id}" data-sid="${s._id}" style="left:${timelineX(globalTime(e, a))}px;width:${bw}px">
        <div class="ramp in" style="width:${ramp}px"></div><div class="ramp out" style="width:${ramp}px"></div>
        ${bw > 44 ? `<span>${s.zoom.toFixed(2)}×</span>` : ''}${bw > 110 && s.follow ? '<span class="follow">follow</span>' : ''}
        <div class="edge l"></div><div class="edge r"></div></div>`;
    }
    for (const k of inf.clicks) if (k.t >= vis0 && k.t <= vis1) ch += `<div class="click" style="left:${timelineX(globalTime(e, k.t))}px"></div>`;
  }
  vh += `<div class="addclip" id="addClip" style="left:${timelineX(S.total) + (S.timeline.length ? 10 : 0)}px">＋ Add recording</div>`;
  $('#vidLane').innerHTML = vh;
  $('#zoomLane').innerHTML = zh;
  $('#clickLane').innerHTML = ch;
  $$('#vidLane .clip').forEach((el) => el.addEventListener('pointerdown', clipDown));
  $$('#vidLane .trans').forEach((el) => el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); app.select({ kind: 'trans', clip: el.dataset.clip }); }));
  $('#addClip').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); showAddMenu(ev.currentTarget); });
  $$('#zoomLane .block').forEach((el) => el.addEventListener('pointerdown', blockDown));
  app.drawSelectionBar();
}

// ------------------------------------------------------------------ interaction
function scrub(e) {
  if (e.button !== 0) return;
  hidePopover();
  app.seek(timeAt(e.clientX));
  drag((ev) => app.seek(timeAt(ev.clientX)));
}

export function bindTimeline() {
  $('#ruler').addEventListener('pointerdown', scrub);
  for (const id of ['#vidLane', '#zoomLane']) {
    $(id).addEventListener('pointerdown', (e) => {
      if (e.target === e.currentTarget || e.target.classList.contains('lanebg')) { app.select(null); scrub(e); }
    });
  }
  $('#zoomLane').addEventListener('dblclick', (e) => { if (!e.target.closest('.block')) addZoom(timeAt(e.clientX)); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#popover') && !e.target.closest('#addClip')) hidePopover(); });
  $('#tlScroll').addEventListener('wheel', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const z = $('#tlZoom');
    z.value = clamp(+z.value * Math.exp(-e.deltaY * 0.004), 1, 12);
    app.layout();
  }, { passive: false });
}

/** Click a clip to select it; drag its edges to trim. */
function clipDown(e) {
  e.stopPropagation();
  hidePopover();
  const c = clipById(e.currentTarget.dataset.clip), inf = S.info[c.id];
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : null;
  app.select({ kind: 'clip', clip: c.id }, false);
  if (!mode) { app.seek(timeAt(e.clientX)); drag((ev) => app.seek(timeAt(ev.clientX))); return; }
  const x0 = e.clientX, a0 = c.trim_start, b0 = c.trim_end;
  drag((ev) => {
    const dt = (ev.clientX - x0) / S.pxPerSec;
    if (mode === 'l') c.trim_start = clamp(a0 + dt, 0, inf.duration - c.trim_end - 1);
    else c.trim_end = clamp(b0 - dt, 0, inf.duration - c.trim_start - 1);
    app.changed({ redraw: true });
    const en = entryOf(c.id);
    app.seek(mode === 'l' ? en.start : en.start + en.len - 0.01);
  }, () => app.changed({ relayout: true }));
}

/** Drag a zoom block to move it, drag its edges to change when it starts/ends. */
function blockDown(e) {
  e.stopPropagation();
  hidePopover();
  const el = e.currentTarget, c = clipById(el.dataset.clip), s = c.segments.find((x) => x._id === +el.dataset.sid);
  const en = entryOf(c.id), inf = S.info[c.id];
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const sorted = [...c.segments].sort((a, b) => a.start - b.start), i = sorted.indexOf(s);
  const lo = Math.max(i > 0 ? sorted[i - 1].end : 0, c.trim_start);
  const hi = Math.min(i < sorted.length - 1 ? sorted[i + 1].start : inf.duration, inf.duration - c.trim_end);
  const x0 = e.clientX, s0 = { start: s.start, end: s.end };
  let moved = false;
  app.select({ kind: 'zoom', clip: c.id, sid: s._id }, false);
  drag((ev) => {
    if (Math.abs(ev.clientX - x0) > 3) moved = true;
    if (!moved) return;
    const dt = (ev.clientX - x0) / S.pxPerSec;
    if (mode === 'move') { const len = s0.end - s0.start; s.start = clamp(s0.start + dt, lo, hi - len); s.end = s.start + len; }
    else if (mode === 'l') s.start = clamp(s0.start + dt, lo, s.end - MIN_BLOCK);
    else s.end = clamp(s0.end + dt, s.start + MIN_BLOCK, hi);
    el.style.left = timelineX(globalTime(en, Math.max(s.start, c.trim_start))) + 'px';
    el.style.width = (Math.min(s.end, inf.duration - c.trim_end) - Math.max(s.start, c.trim_start)) * S.pxPerSec + 'px';
    app.seek(globalTime(en, mode === 'r' ? s.end : s.start));
  }, () => {
    if (moved) app.changed({ clip: c.id });
    else {
      const lt = localTime(en, S.t);
      if (lt < s.start || lt > s.end) app.seek(globalTime(en, Math.min(s.start + 0.8, (s.start + s.end) / 2)));
    }
  });
}

// ------------------------------------------------------------------ edits
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
  // Aim at the next click nearby, otherwise wherever the cursor is.
  const k = inf.clicks.find((k) => k.t >= lt - 0.5 && k.t <= end);
  const s = tagSegment({ start: lt, end, zoom: S.server.defaults.zoom, follow: false,
    x: k ? k.x : sampleAt(inf.cursor.x, inf.cursor.fps, lt), y: k ? k.y : sampleAt(inf.cursor.y, inf.cursor.fps, lt) });
  clampSegment(s, cardFor(c.id).g, S.stage.w, S.stage.h);
  c.segments.push(s);
  S.sel = { kind: 'zoom', clip: c.id, sid: s._id };
  app.changed({ clip: c.id });
}

export function deleteSelected() {
  if (!S.sel) return;
  if (S.sel.kind === 'zoom') {
    const c = clipById(S.sel.clip);
    c.segments = c.segments.filter((s) => s._id !== S.sel.sid);
    S.sel = null;
    app.changed({ clip: c.id });
  } else if (S.sel.kind === 'clip') removeClip(S.sel.clip);
}

export function removeClip(id) {
  if (!confirm('Remove this recording from the project? (The recording itself is kept.)')) return;
  S.project.clips = S.project.clips.filter((c) => c.id !== id);
  S.sel = null;
  app.rebuildCards();
  app.changed({ relayout: true });
}

export function moveClip(id, dir) {
  const clips = S.project.clips, i = clips.findIndex((c) => c.id === id), j = i + dir;
  if (j < 0 || j >= clips.length) return;
  [clips[i], clips[j]] = [clips[j], clips[i]];
  app.changed({ relayout: true });
}

// ------------------------------------------------------------------ add recording
function showAddMenu(anchor) {
  const pop = $('#popover'), r = anchor.getBoundingClientRect(), used = new Set(S.project.clips.map((c) => c.recording));
  pop.innerHTML = '<div class="title">Add a recording</div>' + (S.server.recordings.length
    ? S.server.recordings.map((n) => `<div class="item" data-rec="${n}"><span>${recLabel(n)}</span><small>${used.has(n) ? 'in project' : ''}</small></div>`).join('')
    : '<div class="item"><small>No recordings yet. Run ./record first.</small></div>');
  pop.style.display = 'block';
  pop.style.left = Math.min(r.left, innerWidth - 260) + 'px';
  pop.style.top = Math.max(10, r.top - pop.offsetHeight - 8) + 'px';
  $$('.item[data-rec]', pop).forEach((el) => el.addEventListener('click', () => addClip(el.dataset.rec)));
}

const hidePopover = () => ($('#popover').style.display = 'none');

async function addClip(name) {
  hidePopover();
  toast('Adding recording… (preparing preview video)');
  try {
    const r = await api(`/api/recording?project=${encodeURIComponent(S.id)}&name=${encodeURIComponent(name)}&smoothing=${S.project.cursor.smoothing}`);
    r.clip.segments.forEach(tagSegment);
    S.info[r.clip.id] = r.info;
    S.project.clips.push(r.clip);
    app.rebuildCards();
    app.changed({ relayout: true });
    app.seek(entryOf(r.clip.id).start);
    toast('Recording added');
  } catch (e) { toast(e.message); }
}
