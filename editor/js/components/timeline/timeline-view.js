// Timeline view: ruler, clip lane (transitions, ＋ placeholder), zoom lane, clicks, playhead,
// and the drag interactions on them. Edits go through timeline-actions.js.
import { MIN_BLOCK, TL_PAD, TRANSITION_LABELS } from '../../config/constants.js';
import { globalTime, localTime } from '../../models/timeline.js';
import { actions } from '../../state/actions.js';
import { S, clipById, entryOf } from '../../state/store.js';
import { $, $$, drag } from '../../utils/dom.js';
import { fmt, recLabel } from '../../utils/format.js';
import { clamp } from '../../utils/math.js';
import { hideAddMenu, showAddMenu } from './add-recording-menu.js';
import { addZoom } from './timeline-actions.js';

export const timelineX = (t) => TL_PAD + t * S.pxPerSec;
const timeAt = (clientX) => Math.max(0, (clientX - $('#tlInner').getBoundingClientRect().left - TL_PAD) / S.pxPerSec);
const isSel = (kind, clip, sid) => S.sel && S.sel.kind === kind && S.sel.clip === clip && (sid === undefined || S.sel.sid === sid);

export function layoutTimeline() {
  const sc = $('#tlScroll'), span = Math.max(S.total, 5);
  S.pxPerSec = ((sc.clientWidth - TL_PAD * 2 - 170) / span) * +$('#tlZoom').value;
  $('#tlInner').style.width = span * S.pxPerSec + TL_PAD * 2 + 180 + 'px';
  drawRuler();
  drawTimeline();
}

export function drawPlayhead() {
  $('#time').textContent = `${fmt(S.t)} / ${fmt(S.total)}`;
  $('#playhead').style.left = timelineX(S.t) + 'px';
}

export function followPlayhead() {
  const x = timelineX(S.t), sc = $('#tlScroll');
  if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 80;
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

export function drawTimeline() {
  const pps = S.pxPerSec;
  let vh = '', zh = `<div class="lanebg" style="left:${timelineX(0)}px;width:${S.total * pps}px"></div>`, ch = '';
  for (const e of S.timeline) {
    const c = e.clip, inf = S.info[c.id], w = e.len * pps;
    const pad = e.i > 0 ? e.d * pps / 2 + 46 : 14;  // keep the label clear of the transition chip
    vh += `<div class="clip ${e.i % 2 ? 'alt' : ''} ${isSel('clip', c.id) ? 'sel' : ''}" data-clip="${c.id}" style="left:${timelineX(e.start)}px;width:${w}px;z-index:${e.i + 1};padding-left:${pad}px">
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
  $$('#vidLane .trans').forEach((el) => el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); actions.select({ kind: 'trans', clip: el.dataset.clip }); }));
  $('#addClip').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); showAddMenu(ev.currentTarget); });
  $$('#zoomLane .block').forEach((el) => el.addEventListener('pointerdown', blockDown));
  actions.drawSelectionBar();
}

// ------------------------------------------------------------------ interaction
function scrub(e) {
  if (e.button !== 0) return;
  hideAddMenu();
  actions.seek(timeAt(e.clientX));
  drag((ev) => actions.seek(timeAt(ev.clientX)));
}

export function bindTimeline() {
  $('#ruler').addEventListener('pointerdown', scrub);
  for (const id of ['#vidLane', '#zoomLane']) {
    $(id).addEventListener('pointerdown', (e) => {
      if (e.target === e.currentTarget || e.target.classList.contains('lanebg')) { actions.select(null); scrub(e); }
    });
  }
  $('#zoomLane').addEventListener('dblclick', (e) => { if (!e.target.closest('.block')) addZoom(timeAt(e.clientX)); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#popover, #addClip, #emptyAdd')) hideAddMenu(); });
  $('#emptyAdd').addEventListener('pointerdown', (e) => { e.stopPropagation(); showAddMenu(e.currentTarget); });
  $('#tlZoom').oninput = () => actions.layout();
  $('#tlScroll').addEventListener('wheel', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const z = $('#tlZoom');
    z.value = clamp(+z.value * Math.exp(-e.deltaY * 0.004), 1, 12);
    actions.layout();
  }, { passive: false });
}

/** Click a clip to select it; drag its edges to trim. */
function clipDown(e) {
  e.stopPropagation();
  hideAddMenu();
  const c = clipById(e.currentTarget.dataset.clip), inf = S.info[c.id];
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : null;
  actions.select({ kind: 'clip', clip: c.id }, false);
  if (!mode) { actions.seek(timeAt(e.clientX)); drag((ev) => actions.seek(timeAt(ev.clientX))); return; }
  const x0 = e.clientX, a0 = c.trim_start, b0 = c.trim_end;
  drag((ev) => {
    const dt = (ev.clientX - x0) / S.pxPerSec;
    if (mode === 'l') c.trim_start = clamp(a0 + dt, 0, inf.duration - c.trim_end - 1);
    else c.trim_end = clamp(b0 - dt, 0, inf.duration - c.trim_start - 1);
    actions.changed();
    const en = entryOf(c.id);
    actions.seek(mode === 'l' ? en.start : en.start + en.len - 0.01);
  }, () => actions.changed({ relayout: true }));
}

/** Drag a zoom block to move it; drag its edges to change when it zooms in and out. */
function blockDown(e) {
  e.stopPropagation();
  hideAddMenu();
  const el = e.currentTarget, c = clipById(el.dataset.clip), s = c.segments.find((x) => x._id === +el.dataset.sid);
  const en = entryOf(c.id), inf = S.info[c.id];
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const sorted = [...c.segments].sort((a, b) => a.start - b.start), i = sorted.indexOf(s);
  const lo = Math.max(i > 0 ? sorted[i - 1].end : 0, c.trim_start);
  const hi = Math.min(i < sorted.length - 1 ? sorted[i + 1].start : inf.duration, inf.duration - c.trim_end);
  const x0 = e.clientX, s0 = { start: s.start, end: s.end };
  let moved = false;
  actions.select({ kind: 'zoom', clip: c.id, sid: s._id }, false);
  drag((ev) => {
    if (Math.abs(ev.clientX - x0) > 3) moved = true;
    if (!moved) return;
    const dt = (ev.clientX - x0) / S.pxPerSec;
    if (mode === 'move') { const len = s0.end - s0.start; s.start = clamp(s0.start + dt, lo, hi - len); s.end = s.start + len; }
    else if (mode === 'l') s.start = clamp(s0.start + dt, lo, s.end - MIN_BLOCK);
    else s.end = clamp(s0.end + dt, s.start + MIN_BLOCK, hi);
    el.style.left = timelineX(globalTime(en, Math.max(s.start, c.trim_start))) + 'px';
    el.style.width = (Math.min(s.end, inf.duration - c.trim_end) - Math.max(s.start, c.trim_start)) * S.pxPerSec + 'px';
    actions.seek(globalTime(en, mode === 'r' ? s.end : s.start));
  }, () => {
    if (moved) actions.changed();
    else {
      const lt = localTime(en, S.t);
      if (lt < s.start || lt > s.end) actions.seek(globalTime(en, Math.min(s.start + 0.8, (s.start + s.end) / 2)));
    }
  });
}
