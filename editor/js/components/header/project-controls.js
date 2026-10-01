// Header: project picker, title and "New project".
import { api } from '../../services/api.js';
import { changed, flush } from '../../services/autosave.js';
import { S } from '../../state/store.js';
import { $ } from '../../utils/dom.js';

export function drawProjectControls() {
  $('#projSelect').innerHTML = S.server.projects.map((p) => `<option value="${p.id}" ${p.id === S.id ? 'selected' : ''}>${p.title}</option>`).join('');
  $('#titleInput').value = S.project.title || '';
}

export function bindProjectControls() {
  $('#projSelect').onchange = async (e) => { await flush(); location.search = '?project=' + encodeURIComponent(e.target.value); };
  $('#titleInput').oninput = (e) => {
    S.project.title = e.target.value;
    const o = $(`#projSelect option[value="${S.id}"]`);
    if (o) o.textContent = S.project.title || S.id;
    changed({ redraw: false });
  };
  $('#newBtn').onclick = async () => { await flush(); location.search = '?project=' + (await api('/api/projects/new', {})).id; };
}
