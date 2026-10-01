// Render buttons and progress display (renders run on the server, see demorec/server/jobs.py).
import { api } from './api.js';
import { flush } from './persistence.js';
import { S } from './state.js';
import { $, toast } from './util.js';

let lastKind = null;

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
  if (running) setTimeout(poll, 400);
}
