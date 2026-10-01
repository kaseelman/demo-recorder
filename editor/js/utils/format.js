// Display formatting.

/** Seconds -> "m:ss.s". */
export function fmt(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Recording folder name -> readable label. */
export const recLabel = (name) => name.split('/').pop().replace(/_/g, ' ');
