// Playback clock. The project time S.t drives everything; videos are kept in sync by the stage.
import { app } from './app.js';
import { S } from './state.js';
import { $, clamp } from './util.js';
import { timelineX } from './timeline.js';

let clock0 = 0, t0 = 0;

function loop() {
  if (!S.playing) return;
  S.t = t0 + (performance.now() - clock0) / 1000;
  if (S.t >= S.total) { S.t = S.total; pause(); return; }
  app.update();
  const x = timelineX(S.t), sc = $('#tlScroll');
  if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 80;
  requestAnimationFrame(loop);
}

export function play() {
  if (!S.timeline.length) return;
  if (S.t >= S.total - 0.02) S.t = 0;
  S.playing = true;
  clock0 = performance.now();
  t0 = S.t;
  $('#playBtn').textContent = '❚❚ Pause';
  requestAnimationFrame(loop);
}

export function pause() {
  S.playing = false;
  $('#playBtn').textContent = '▶︎ Play';
  app.update();
}

export const togglePlay = () => (S.playing ? pause() : play());

export function seek(t) {
  S.t = clamp(t, 0, S.total);
  if (S.playing) { t0 = S.t; clock0 = performance.now(); }
  app.update();
}
