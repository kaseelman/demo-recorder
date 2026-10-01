// Background spec -> CSS. Mirrors demorec/compose.py:make_background (same gradient maths).

export function backgroundCSS(bg) {
  const stops = (bg.colors || []).join(', ');
  if (bg.type === 'image') return `url("/bg/${bg.image}") center / cover`;
  if (bg.type === 'linear') return `linear-gradient(${bg.angle}deg, ${stops})`;
  if (bg.type === 'radial') return `radial-gradient(circle farthest-corner at ${bg.center[0] * 100}% ${bg.center[1] * 100}%, ${stops})`;
  if (bg.type === 'solid') return bg.color;
  return '#000';
}
