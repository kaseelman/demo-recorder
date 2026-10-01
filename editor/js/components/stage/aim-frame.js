// Aiming a zoom block: the purple frame over the canvas that you drag and resize.
// A block stores its zoom (relative to the canvas) and the recording point it centres on.
import { MAX_ZOOM } from '../../config/constants.js';
import { canvasToRec, clampSegment, recToCanvas } from '../../models/geometry.js';
import { actions } from '../../state/actions.js';
import { S, selectedSegment } from '../../state/store.js';
import { $, drag } from '../../utils/dom.js';
import { clamp } from '../../utils/math.js';

const frame = document.createElement('div');
frame.id = 'frame';
frame.innerHTML = '<span class="tag"></span>' + ['nw', 'ne', 'sw', 'se'].map((c) => `<i class="h" data-c="${c}"></i>`).join('');
let current = null;  // the card of the block being aimed

export function drawAimFrame(card) {
  const s = selectedSegment();
  current = card;
  if (!s || !card) { frame.style.display = 'none'; return; }
  if (!frame.parentElement) $('#stage').appendChild(frame);
  const ow = S.stage.w, oh = S.stage.h, w = ow / s.zoom, h = oh / s.zoom, [cx, cy] = recToCanvas(card.g, s.x, s.y);
  Object.assign(frame.style, { display: 'block', width: w + 'px', height: h + 'px', left: cx - w / 2 + 'px', top: cy - h / 2 + 'px' });
  $('.tag', frame).textContent = s.zoom.toFixed(2) + '×' + (s.follow ? ' · follows cursor' : '');
}

/** Keep the selection bar and the block label in sync while zooming. */
export function syncZoomLabels(s) {
  const r = $('#zoomRange'); if (r) r.value = s.zoom;
  const v = $('#zoomVal'); if (v) v.textContent = s.zoom.toFixed(2) + '×';
  const b = $(`.block[data-sid="${s._id}"] span`); if (b) b.textContent = s.zoom.toFixed(2) + '×';
}

export function setZoom(s, zoom) {
  s.zoom = clamp(zoom, 1, MAX_ZOOM);
  s.follow = false;
  if (current) clampSegment(s, current.g, S.stage.w, S.stage.h);
}

frame.addEventListener('pointerdown', (e) => {
  const s = selectedSegment();
  if (!s || !current) return;
  e.preventDefault();
  e.stopPropagation();
  const g = current.g, ow = S.stage.w, oh = S.stage.h;
  const rect = $('#stage').getBoundingClientRect(), corner = e.target.dataset.c;
  const [cx0, cy0] = recToCanvas(g, s.x, s.y), x0 = e.clientX, y0 = e.clientY, w0 = ow / s.zoom, h0 = oh / s.zoom;
  // While resizing, the opposite corner stays put.
  const ax = cx0 + (corner && corner.includes('w') ? w0 / 2 : -w0 / 2), ay = cy0 + (corner && corner.includes('n') ? h0 / 2 : -h0 / 2);
  drag((ev) => {
    let cx, cy;
    if (!corner) { cx = cx0 + ev.clientX - x0; cy = cy0 + ev.clientY - y0; }
    else {
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const w = clamp(Math.max(Math.abs(px - ax), Math.abs(py - ay) * ow / oh), ow / MAX_ZOOM, ow), h = w * oh / ow;
      s.zoom = ow / w;
      cx = ax + (corner.includes('w') ? -w / 2 : w / 2);
      cy = ay + (corner.includes('n') ? -h / 2 : h / 2);
    }
    [s.x, s.y] = canvasToRec(g, cx, cy);
    s.follow = false;  // aimed by hand: keep this framing
    clampSegment(s, g, ow, oh);
    actions.update();
    actions.drawSelectionBar();
  }, () => actions.changed());
});

frame.addEventListener('wheel', (e) => {
  const s = selectedSegment();
  if (!s) return;
  e.preventDefault();
  setZoom(s, s.zoom * Math.exp(-e.deltaY * 0.002));
  actions.update();
  syncZoomLabels(s);
  actions.changed({ redraw: false });
}, { passive: false });
