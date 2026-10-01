// The ＋ Add recording popover at the end of the clip lane.
import { api } from '../../services/api.js';
import { actions } from '../../state/actions.js';
import { S, entryOf, tagSegment } from '../../state/store.js';
import { $, $$, toast } from '../../utils/dom.js';
import { recLabel } from '../../utils/format.js';

export function showAddMenu(anchor) {
  const pop = $('#popover'), r = anchor.getBoundingClientRect(), used = new Set(S.project.clips.map((c) => c.recording));
  pop.innerHTML = '<div class="title">Add a recording</div>' + (S.server.recordings.length
    ? S.server.recordings.map((n) => `<div class="item" data-rec="${n}"><span>${recLabel(n)}</span><small>${used.has(n) ? 'in project' : ''}</small></div>`).join('')
    : '<div class="item"><small>No recordings yet. Run ./record first.</small></div>');
  pop.style.display = 'block';
  pop.style.left = Math.min(r.left, innerWidth - 260) + 'px';
  pop.style.top = Math.max(10, r.top - pop.offsetHeight - 8) + 'px';
  $$('.item[data-rec]', pop).forEach((el) => el.addEventListener('click', () => addRecording(el.dataset.rec)));
}

export const hideAddMenu = () => ($('#popover').style.display = 'none');

async function addRecording(name) {
  hideAddMenu();
  toast('Adding recording… (preparing preview video)');
  try {
    const q = `project=${encodeURIComponent(S.id)}&name=${encodeURIComponent(name)}&smoothing=${S.project.cursor.smoothing}`;
    const r = await api('/api/recording?' + q);
    r.clip.segments.forEach(tagSegment);
    S.info[r.clip.id] = r.info;
    S.project.clips.push(r.clip);
    actions.rebuildCards();
    actions.changed({ relayout: true });
    actions.seek(entryOf(r.clip.id).start);
    toast('Recording added');
  } catch (e) { toast(e.message); }
}
