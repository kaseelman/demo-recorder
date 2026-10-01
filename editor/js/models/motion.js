// Camera blending and transition poses. Mirrors demorec/export.py and demorec/compose.py.
import { easeInOut } from '../utils/math.js';

/** Camera midway through a transition: zoom blends in log space. */
export function blendCameras(a, b, e) {
  return { z: Math.exp(Math.log(a.z) * (1 - e) + Math.log(b.z) * e), x: a.x * (1 - e) + b.x * e, y: a.y * (1 - e) + b.y * e };
}

/** Transform of the outgoing (a) and incoming (b) clip at progress p of a transition. */
export function transitionPose(kind, p, ow, oh) {
  const e = easeInOut(p);
  const a = { dx: 0, dy: 0, s: 1, o: 1 }, b = { dx: 0, dy: 0, s: 1, o: 1 };
  if (kind === 'slide-left') { a.dx = -e * ow; b.dx = (1 - e) * ow; }
  else if (kind === 'slide-up') { a.dy = -e * oh; b.dy = (1 - e) * oh; }
  else if (kind === 'scale') { a.s = 1 - 0.06 * e; a.o = 1 - e; b.s = 1.06 - 0.06 * e; b.o = e; }
  else b.o = e;  // crossfade
  return { a, b };
}
