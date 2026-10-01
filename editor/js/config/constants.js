// Fixed options and presets used across the editor.

export const ASPECTS = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
export const MIN_BLOCK = 0.3;   // shortest zoom block (s)
export const MAX_ZOOM = 3;
export const TL_PAD = 16;       // timeline left padding (px)
export const RIPPLE_SECONDS = 0.45;

export const TRANSITION_LABELS = {
  cut: '✂︎ Cut', crossfade: '◐ Fade', 'slide-left': '⇠ Slide', 'slide-up': '⇡ Slide', scale: '⤢ Scale',
};

export const GRADIENTS = [
  ['#8b7bff', '#ff9ab5'], ['#4facfe', '#00f2fe'], ['#f6d365', '#fda085'], ['#a1c4fd', '#c2e9fb'],
  ['#0f2027', '#2c5364'], ['#ff9a9e', '#fecfef'], ['#43e97b', '#38f9d7'], ['#30cfd0', '#330867'],
  ['#e0c3fc', '#8ec5fc'], ['#fbc2eb', '#a6c1ee'], ['#1e1e2f', '#3a3a5c'], ['#ffecd2', '#fcb69f'],
];
export const SOLIDS = ['#f5f5f7', '#e8e8ed', '#d2d2d7', '#1d1d1f', '#0b0b0f', '#eef0ff',
  '#fff4ec', '#e9f7ef', '#fdecef', '#e6f0ff', '#2b2f3a', '#3b2f5c'];

const ARROW = 'M0 0 L0 16.5 L4 12.8 L6.6 18.8 L9.3 17.7 L6.8 11.8 L11.8 11.8 Z';

// Cursor styles as SVG, in units of ~1pt with the hotspot at (0,0). Mirrors demorec/cursor.py.
export const CURSORS = {
  arrow: { label: 'Arrow', box: [-1.5, -1.5, 15, 22],
    svg: `<path d="${ARROW}" fill="#000" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>` },
  'arrow-white': { label: 'White', box: [-1.5, -1.5, 15, 22],
    svg: `<path d="${ARROW}" fill="#fff" stroke="#1a1a1a" stroke-width="1.3" stroke-linejoin="round"/>` },
  dot: { label: 'Dot', box: [-9, -9, 18, 18],
    svg: '<circle r="7" fill="rgba(20,20,20,.55)" stroke="#fff" stroke-width="1.4"/>' },
  highlight: { label: 'Halo', box: [-15, -15, 30, 36],
    svg: `<circle r="14" fill="rgba(255,214,74,.38)"/><path d="${ARROW}" fill="#000" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>` },
  none: { label: 'Hidden', box: [0, 0, 1, 1], svg: '' },
};
