// Playback clock. Project time S.t drives everything; the stage keeps the videos in sync.
import { actions } from '../state/actions.js';
import { S } from '../state/store.js';
import { $ } from '../utils/dom.js';
import { clamp } from '../utils/math.js';

let clock0 = 0, t0 = 0;

function loop() {
  if (!S.playing) return;
  S.t = t0 + (performance.now() - clock0) / 1000;
  if (S.t >= S.total) { S.t = S.total; pause(); return; }
  actions.update();
  actions.followPlayhead();
  requestAnimationFrame(loop);
}

export function play() {
  if (!S.timeline.length) return;
  if (S.t >= S.total - 0.02) S.t = 0;
  S.playing = true;
  clock0 = performance.now();
  t0 = S.t;
  $('#playBtn').classList.add('playing');
  requestAnimationFrame(loop);
}

export function pause() {
  S.playing = false;
  $('#playBtn').classList.remove('playing');
  actions.update();
}

export const togglePlay = () => (S.playing ? pause() : play());

export function seek(t) {
  S.t = clamp(t, 0, S.total);
  if (S.playing) { t0 = S.t; clock0 = performance.now(); }
  actions.update();
}
