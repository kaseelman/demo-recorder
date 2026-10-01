// Cursor styles as inline SVG (used by the stage and the cursor picker).
import { CURSORS } from '../../config/constants.js';

/** SVG for `style` scaled so 1 unit = `unit` px, positioned so the hotspot is at (0, 0). */
export function cursorSVG(style, unit, positioned = true) {
  const c = CURSORS[style] || CURSORS.arrow, [x, y, w, h] = c.box;
  const pos = positioned ? ` style="left:${x * unit}px;top:${y * unit}px"` : '';
  return `<svg viewBox="${c.box.join(' ')}" width="${w * unit}" height="${h * unit}"${pos}>${c.svg}</svg>`;
}
