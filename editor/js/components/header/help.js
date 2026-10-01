// The ? button: a floating card with shortcuts and tips.
import { $ } from '../../utils/dom.js';

export function bindHelp() {
  const card = $('#help');
  $('#helpBtn').addEventListener('click', (e) => { e.stopPropagation(); card.classList.toggle('open'); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#help, #helpBtn')) card.classList.remove('open'); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') card.classList.remove('open'); });
}
