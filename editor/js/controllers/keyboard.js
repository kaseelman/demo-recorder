// Global keyboard shortcuts.
import { endCrop } from '../components/stage/crop-box.js';
import { addZoom, deleteSelected } from '../components/timeline/timeline-actions.js';
import { pause, seek, togglePlay } from '../services/playback.js';
import { actions } from '../state/actions.js';
import { S } from '../state/store.js';

export function bindKeyboard() {
  addEventListener('keydown', (e) => {
    const typing = e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type));
    if (!S.project || typing) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'z' || k === 'Z') addZoom(S.t);
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); deleteSelected(); }
    else if (k === 'Escape') { if (S.cropping) { endCrop(); actions.drawSelectionBar(); } else actions.select(null); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (S.playing) pause();
      seek(S.t + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30));
    }
  });
}
