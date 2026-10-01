// Render buttons and progress display (renders run on the server, see demorec/server/jobs.py).
import { api } from '../../services/api.js';
import { flush } from '../../services/autosave.js';
import { S } from '../../state/store.js';
import { $, toast } from '../../utils/dom.js';

let lastKind = null, wasRunning = false;

/** A little confetti pop from an element: the render is done! */
function burst(el) {
  const r = el.getBoundingClientRect(), colors = ['#9d8cff', '#ff7ac6', '#5ee6d0', '#ffd54a', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span'), a = (i / 18) * Math.PI * 2, d = 40 + Math.random() * 50;
    p.className = 'burst';
    Object.assign(p.style, { left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px', position: 'fixed',
      background: colors[i % colors.length], '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px' });
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

export function bindRenderButtons() {
  $('#previewBtn').onclick = () => start(true);
  $('#finalBtn').onclick = () => start(false);
  $('#openBtn').onclick = () => api('/api/open', { kind: lastKind }).catch((e) => toast(e.message));
  $('#revealBtn').onclick = () => api('/api/reveal', { kind: lastKind }).catch((e) => toast(e.message));
}

async function start(preview) {
  await flush();
  const r = await api('/api/render', { preview });
  if (!r.ok) toast('A render is already running');
  poll();
}

export async function poll() {
  let j;
  try { j = await api('/api/render'); } catch { return; }
  const prog = $('#progress'), msg = $('#renderMsg'), running = !!j.running;
  $('#previewBtn').disabled = $('#finalBtn').disabled = running;
  if (!j.kind || j.project !== S.id) { prog.style.display = 'none'; if (running) setTimeout(poll, 800); return; }
  lastKind = j.kind;
  prog.style.display = running ? 'block' : 'none';
  prog.firstElementChild.style.width = (j.progress * 100).toFixed(1) + '%';
  const done = !running && !j.error;
  $('#openBtn').style.display = $('#revealBtn').style.display = done ? '' : 'none';
  if (running) msg.textContent = `Rendering ${j.kind}… ${Math.round(j.progress * 100)}%`;
  else if (j.error) { msg.textContent = 'Render failed (details in the terminal)'; console.error(j.error); }
  else msg.textContent = `✓ ${j.kind}.mp4 ready`;
  if (wasRunning && done) burst($('#openBtn'));
  wasRunning = running;
  if (running) setTimeout(poll, 400);
}
