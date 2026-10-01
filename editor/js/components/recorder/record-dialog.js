// The Record dialog: pick a screen or window, count down, record, stop, and add the result
// to the project. Recording itself runs in the native recorder; this only drives it.
import { ACTIVE, captureStatus, listSources, startCapture, stopCapture } from '../../services/capture.js';
import { S } from '../../state/store.js';
import { $, $$, toast } from '../../utils/dom.js';
import { addRecording } from '../timeline/add-recording-menu.js';

const dialog = () => $('#recordDialog');
const body = () => $('#recBody');
let sources = null, tab = 'display', choice = null, countdown = 3, polling = false, lastState = 'idle';

export function bindRecordDialog() {
  $('#recordBtn').onclick = open;
  $('#emptyRecord').onclick = open;
  $('#recClose').onclick = close;
  dialog().addEventListener('pointerdown', (e) => { if (e.target === dialog() && !ACTIVE.includes(lastState)) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dialog().hidden && !ACTIVE.includes(lastState)) close(); });
  captureStatus().then(follow).catch(() => {});  // pick up a recording already in progress
  if (new URLSearchParams(location.search).has('record')) open();  // ?record opens the dialog straight away
}

async function open() {
  dialog().hidden = false;
  if (ACTIVE.includes(lastState)) return renderLive(await captureStatus());
  body().innerHTML = '<div class="rec-center"><div class="loader"><i></i><i></i><i></i></div><p>Looking at your screens…</p></div>';
  try {
    sources = await listSources();
    choice = choice && findSource(choice) ? choice : defaultChoice();
    renderPicker();
  } catch (e) { renderError(e.message); }
}

function close() { dialog().hidden = true; }

const defaultChoice = () => {
  const main = sources.displays.find((d) => d.main) || sources.displays[0];
  return main ? { kind: 'display', id: main.index } : null;
};
const findSource = (c) => (c.kind === 'display' ? sources.displays.find((d) => d.index === c.id) : sources.windows.find((w) => w.id === c.id));

function renderPicker() {
  const items = tab === 'display'
    ? sources.displays.map((d) => ({ kind: 'display', id: d.index, thumb: d.thumb, title: d.main ? 'Main display' : `Display ${d.index + 1}`, sub: `${d.width} × ${d.height}` }))
    : sources.windows.map((w) => ({ kind: 'window', id: w.id, thumb: w.thumb, title: w.app, sub: w.title || `${w.width} × ${w.height}` }));
  body().innerHTML = `
    <div class="rec-toolbar">
      <div class="seg" id="recTabs">
        <button data-tab="display" class="${tab === 'display' ? 'on' : ''}">Entire screen</button>
        <button data-tab="window" class="${tab === 'window' ? 'on' : ''}">Window</button>
      </div>
    </div>
    <div class="sources">${items.length ? items.map((it) => `
      <button class="source ${choice && choice.kind === it.kind && choice.id === it.id ? 'on' : ''}" data-kind="${it.kind}" data-id="${it.id}">
        <div class="thumb-wrap">${it.thumb ? `<img src="/capture-thumbs/${it.thumb}?t=${Date.now()}" alt="">` : '<div class="no-thumb"></div>'}</div>
        <b>${escapeHTML(it.title)}</b><small>${escapeHTML(it.sub)}</small>
      </button>`).join('') : '<p class="hint">No windows found. Open the app you want to record and try again.</p>'}</div>
    <div class="rec-footer">
      <label class="countdown">Countdown <div class="seg" id="recCountdown">${[0, 3, 5].map((n) => `<button data-n="${n}" class="${countdown === n ? 'on' : ''}">${n ? n + 's' : 'Off'}</button>`).join('')}</div></label>
      <span class="hint">After you press Start, switch to the app you want to show.</span>
      <div class="spacer"></div>
      <button id="recStart" class="record-btn big" ${choice ? '' : 'disabled'}><span class="rec-dot"></span>Start recording</button>
    </div>`;
  $$('#recTabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPicker(); }));
  $$('.source').forEach((b) => (b.onclick = () => { choice = { kind: b.dataset.kind, id: +b.dataset.id }; renderPicker(); }));
  $$('#recCountdown button').forEach((b) => (b.onclick = () => { countdown = +b.dataset.n; renderPicker(); }));
  $('#recStart').onclick = start;
}

async function start() {
  try {
    follow(await startCapture(choice.kind, choice.id, countdown));
  } catch (e) { renderError(e.message); }
}

/** Poll the session and reflect it in the dialog and the header button. */
function follow(st) {
  lastState = st.state;
  const btn = $('#recordBtn'), active = ACTIVE.includes(st.state);
  btn.classList.toggle('live', active);
  $('.rec-label', btn).textContent = st.state === 'recording' ? fmt(st.elapsed) : st.state === 'countdown' ? `${st.countdown}…` : 'Record';
  if (!dialog().hidden || active) {
    if (active) renderLive(st);
    else if (st.state === 'saved') onSaved(st);
    else if (st.state === 'error') renderError(st.message);
    else if (st.state === 'cancelled' && !dialog().hidden) renderPicker();
  }
  if (active && !polling) {
    polling = true;
    setTimeout(async () => { polling = false; try { follow(await captureStatus()); } catch { /* server gone */ } }, 500);
  }
}

function renderLive(st) {
  if (dialog().hidden) return;
  const label = { starting: 'Getting ready…', countdown: `Starting in ${st.countdown}…`, recording: fmt(st.elapsed), saving: 'Saving…' }[st.state];
  body().innerHTML = `
    <div class="rec-center live">
      <div class="pulse ${st.state}"><span></span></div>
      <div class="rec-time">${label}</div>
      <p>${st.state === 'recording' ? 'Do your demo. Stop with the <b>● timer in the menu bar</b>, <kbd>⌃</kbd><kbd>⌥</kbd><kbd>⌘</kbd><kbd>S</kbd>, or here.'
        : st.state === 'saving' ? 'Wrapping up your recording…' : 'Switch to the app you want to show.'}</p>
      ${st.state === 'saving' ? '' : '<button id="recStop" class="stop-btn big"><span></span>Stop</button>'}
    </div>`;
  const stop = $('#recStop');
  if (stop) stop.onclick = async () => follow(await stopCapture());
}

async function onSaved(st) {
  if (lastHandled === st.name) return;
  lastHandled = st.name;
  if (!S.server.recordings.includes(st.name)) S.server.recordings.unshift(st.name);
  dialog().hidden = false;
  body().innerHTML = `
    <div class="rec-center done">
      <div class="done-badge">✓</div>
      <div class="rec-time">Nice take!</div>
      <p>Adding it to your project with automatic zooms…</p>
    </div>`;
  await addRecording(st.name);
  body().innerHTML = `
    <div class="rec-center done">
      <div class="done-badge">✓</div>
      <div class="rec-time">Nice take!</div>
      <p>It's on your timeline with automatic zooms. Tweak anything you like.</p>
      <div class="empty-actions"><button id="recAgain" class="ghost-btn big">Record another</button><button id="recDone" class="primary big">Done</button></div>
    </div>`;
  $('#recAgain').onclick = open;
  $('#recDone').onclick = close;
}
let lastHandled = null;

function renderError(message) {
  dialog().hidden = false;
  body().innerHTML = `<div class="rec-center"><div class="done-badge err">!</div><div class="rec-time">That didn't work</div>
    <p>${escapeHTML(message)}</p><button id="recRetry" class="ghost-btn big">Try again</button></div>`;
  $('#recRetry').onclick = open;
  toast('Recording problem: see the dialog');
}

const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
