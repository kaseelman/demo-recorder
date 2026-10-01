// The stage: a live preview of the output canvas (background, glass frames, recordings,
// cursor, transitions). The camera transforms the whole canvas (#world), like the renderer.
// Camera and cursor paths come from the server, so motion matches the render exactly.
import { RIPPLE_SECONDS } from '../../config/constants.js';
import { backgroundCSS } from '../../models/background.js';
import { cardGeometry, clipAspect, cropOf, FULL_CROP, outputRatio } from '../../models/geometry.js';
import { blendCameras, transitionPose } from '../../models/motion.js';
import { activeAt, localTime } from '../../models/timeline.js';
import { actions } from '../../state/actions.js';
import { S, entryOf } from '../../state/store.js';
import { $ } from '../../utils/dom.js';
import { clamp, easeInOut, sampleAt } from '../../utils/math.js';
import { drawAimFrame } from './aim-frame.js';
import { drawCropBox } from './crop-box.js';
import { cursorSVG } from './cursor-svg.js';

const cards = {};  // clip id -> { el, screen, layer, video, cursor, ripple, g (geometry), unit }

export const cardFor = (id) => cards[id];

export function rebuildCards() {
  for (const id in cards) { cards[id].el.remove(); delete cards[id]; }
  for (const c of S.project.clips) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="screen"><div class="layer"><video muted playsinline preload="auto"></video>
      <div class="ripple"></div><div class="cursor"></div></div></div>`;
    $('#world').appendChild(el);
    const video = $('video', el);
    video.src = '/video?recording=' + encodeURIComponent(c.recording);
    video.addEventListener('seeked', () => { if (!S.playing) actions.update(); });
    video.addEventListener('loadeddata', () => actions.update());
    el.addEventListener('pointerdown', (e) => clickStage(e, c.id));
    cards[c.id] = { el, screen: $('.screen', el), layer: $('.layer', el), video, cursor: $('.cursor', el), ripple: $('.ripple', el) };
  }
  $('#empty').style.display = S.project.clips.length ? 'none' : 'flex';
}

/** Size the stage to the output aspect and lay out every clip's glass frame. */
export function layoutStage() {
  const p = S.project, wrap = $('#stageWrap'), first = p.clips[0];
  const ar = outputRatio(p, first ? clipAspect(S.info[first.id], cropOf(first)) : 16 / 10);
  const ow = Math.floor(Math.min(wrap.clientWidth - 36, (wrap.clientHeight - 36) * ar)), oh = Math.floor(ow / ar);
  S.stage = { w: ow, h: oh };
  Object.assign($('#stage').style, { width: ow + 'px', height: oh + 'px' });

  const bg = p.background, bgl = $('#bgLayer');
  bgl.style.background = backgroundCSS(bg);
  const blur = bg.type === 'image' ? (bg.blur || 0) * ow / 1920 : 0;
  bgl.style.filter = blur ? `blur(${blur}px)` : '';
  bgl.style.transform = blur ? 'scale(1.06)' : '';

  const f = p.frame, k = ow / 1920, plain = bg.type === 'none', cur = p.cursor;
  for (const c of p.clips) {
    const card = cards[c.id], inf = S.info[c.id];
    const g = cardGeometry(p, ow, oh, inf, S.cropping === c.id ? { ...FULL_CROP } : cropOf(c));
    card.g = g;
    Object.assign(card.el.style, { left: g.x - g.b + 'px', top: g.y - g.b + 'px', width: g.iw + 2 * g.b + 'px',
      height: g.ih + 2 * g.b + 'px', padding: g.b + 'px', borderRadius: (g.b ? g.r + g.b : g.r) + 'px' });
    Object.assign(card.screen.style, { width: g.iw + 'px', height: g.ih + 'px', borderRadius: g.r + 'px' });
    Object.assign(card.layer.style, { left: g.lx + 'px', top: g.ly + 'px', width: g.lw + 'px', height: g.lh + 'px', right: 'auto', bottom: 'auto' });
    if (plain) {
      Object.assign(card.el.style, { background: 'none', boxShadow: 'none', backdropFilter: 'none' });
      card.screen.style.boxShadow = 'none';
    } else {
      // Same recipe as compose.Card: frosted rim, two-layer shadow, inner/outer edge lines.
      card.el.style.background = g.b ? `linear-gradient(rgba(255,255,255,${f.glass * 1.25}), rgba(255,255,255,${f.glass * 0.8}))` : 'none';
      card.el.style.backdropFilter = card.el.style.webkitBackdropFilter = g.b ? `blur(${28 * k}px) saturate(1.2)` : 'none';
      const shadows = [`0 ${22 * k}px ${68 * k}px rgba(0,0,0,${0.42 * f.shadow})`, `0 ${3 * k}px ${10 * k}px rgba(0,0,0,${0.3 * f.shadow})`];
      if (f.stroke) { shadows.push('0 0 0 1px rgba(0,0,0,.14)'); if (g.b) shadows.push('inset 0 0 0 1px rgba(255,255,255,.55)'); }
      card.el.style.boxShadow = shadows.join(', ');
      card.screen.style.boxShadow = f.stroke && g.b ? '0 0 0 1px rgba(0,0,0,.22)' : 'none';
    }
    card.unit = inf.scale * cur.size * g.lw / inf.width;  // 1 cursor unit ≈ 1pt on the recorded screen
    card.cursor.innerHTML = cur.style === 'none' ? '' : cursorSVG(cur.style, card.unit);
    card.ripple.style.background = S.server.defaults.ripple_color;
  }
}

function cameraAt(e) {
  const inf = S.info[e.clip.id], P = inf.path, lt = clamp(localTime(e, S.t), 0, inf.duration);
  return { z: sampleAt(P.z, P.fps, lt), x: sampleAt(P.x, P.fps, lt), y: sampleAt(P.y, P.fps, lt) };
}

/** Redraw the stage for the current time. Called every animation frame while playing. */
export function drawStage() {
  if (!S.project) return;
  const act = activeAt(S.timeline, S.total, S.t);
  // Aiming a zoom or cropping shows that clip un-zoomed so you can see the whole canvas.
  const editId = S.cropping || (S.sel && S.sel.kind === 'zoom' && !S.playing ? S.sel.clip : null);
  const editEntry = editId ? act.find((e) => e.clip.id === editId) || (S.cropping ? entryOf(S.cropping) : null) : null;
  const tag = $('#modeTag');
  tag.style.display = S.project.clips.length ? 'block' : 'none';
  tag.textContent = S.cropping ? 'Cropping: drag the yellow box · Done when finished'
    : editEntry ? 'Aiming zoom: drag the frame · Esc to see the camera' : (S.playing ? 'Playing' : 'Camera view (what the render shows)');

  const ow = S.stage.w, oh = S.stage.h, still = { dx: 0, dy: 0, s: 1, o: 1 };
  const shown = new Map();
  let cam = { z: 1, x: 0.5, y: 0.5 };
  if (editEntry) shown.set(editEntry.clip.id, { ...still, z: 2 });
  else if (act.length === 1) { shown.set(act[0].clip.id, { ...still, z: 1 }); cam = cameraAt(act[0]); }
  else if (act.length >= 2) {
    const [A, B] = act, p = (S.t - B.start) / B.d, pose = transitionPose(B.clip.transition.type, p, ow, oh);
    shown.set(A.clip.id, { ...pose.a, z: 1 });
    shown.set(B.clip.id, { ...pose.b, z: 2 });
    cam = blendCameras(cameraAt(A), cameraAt(B), easeInOut(p));
  }
  // translate3d keeps the canvas on the GPU with sub-pixel positioning (no 1px snapping jitter).
  $('#world').style.transform = `translate3d(${ow / 2 - cam.z * cam.x * ow}px, ${oh / 2 - cam.z * cam.y * oh}px, 0) scale(${cam.z})`;

  for (const e of S.timeline) drawCard(e, shown.get(e.clip.id));
  drawGhost(editEntry && !S.cropping ? cameraAt(editEntry) : null);
  syncVideos(shown);
  drawAimFrame(editEntry && !S.cropping ? cards[editEntry.clip.id] : null);
  drawCropBox(S.cropping ? cards[S.cropping] : null);
}

/** Dashed rectangle showing where the camera really is (while aiming). */
function drawGhost(cam) {
  const gh = $('#ghost'), ow = S.stage.w, oh = S.stage.h;
  if (!cam || cam.z < 1.01) { gh.style.display = 'none'; return; }
  const w = ow / cam.z, h = oh / cam.z;
  Object.assign(gh.style, { display: 'block', width: w + 'px', height: h + 'px', left: cam.x * ow - w / 2 + 'px', top: cam.y * oh - h / 2 + 'px' });
}

function drawCard(e, pose) {
  const card = cards[e.clip.id], inf = S.info[e.clip.id];
  if (!pose) { card.el.style.visibility = 'hidden'; return; }
  Object.assign(card.el.style, { visibility: 'visible', opacity: pose.o, zIndex: pose.z,
    transform: `translate(${pose.dx}px, ${pose.dy}px) scale(${pose.s})` });
  const lt = clamp(localTime(e, S.t), 0, inf.duration), g = card.g, C = inf.cursor;
  const click = inf.clicks.findLast((k) => k.t <= lt && lt - k.t < RIPPLE_SECONDS);
  const pressed = inf.clicks.some((k) => lt >= k.t && lt - k.t < 0.12);
  Object.assign(card.cursor.style, { left: sampleAt(C.x, C.fps, lt) * g.lw + 'px', top: sampleAt(C.y, C.fps, lt) * g.lh + 'px',
    transform: pressed ? `scale(${S.server.defaults.click_scale})` : '' });
  if (click && S.project.cursor.ripple && S.project.cursor.style !== 'none') {
    const p = (lt - click.t) / RIPPLE_SECONDS, r = (5 + 14 * (1 - (1 - p) ** 3)) * card.unit;
    Object.assign(card.ripple.style, { display: 'block', left: click.x * g.lw + 'px', top: click.y * g.lh + 'px',
      width: 2 * r + 'px', height: 2 * r + 'px', opacity: S.server.defaults.ripple_opacity * (1 - p) });
  } else card.ripple.style.display = 'none';
}

function syncVideos(shown) {
  for (const e of S.timeline) {
    const v = cards[e.clip.id].video, lt = clamp(localTime(e, S.t), 0, S.info[e.clip.id].duration - 0.01);
    if (shown.has(e.clip.id)) {
      if (S.playing) {
        if (v.paused) { v.currentTime = lt; v.play().catch(() => {}); }
        else if (Math.abs(v.currentTime - lt) > 0.25) v.currentTime = lt;
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - lt) > 0.02) v.currentTime = lt;
      }
    } else {
      if (!v.paused) v.pause();
      // Pre-seek clips that are about to appear so transitions start clean.
      if (S.t >= e.start - 1.5 && S.t < e.start && !v.seeking && Math.abs(v.currentTime - e.clip.trim_start) > 0.05) {
        v.currentTime = e.clip.trim_start;
      }
    }
  }
}

/** Clicking the screen while the playhead is inside a zoom block selects that block. */
function clickStage(e, clipId) {
  if (e.target.closest('#frame') || e.target.closest('#cropBox') || S.cropping) return;
  const en = entryOf(clipId), lt = localTime(en, S.t);
  const s = (en.clip.segments || []).find((s) => lt >= s.start && lt < s.end);
  if (s) actions.select({ kind: 'zoom', clip: clipId, sid: s._id });
}
