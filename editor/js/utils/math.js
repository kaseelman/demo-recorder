// Numeric helpers.

export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export function easeInOut(p) {
  p = clamp(p, 0, 1);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}

/** Linear interpolation into an array sampled at `fps`. */
export function sampleAt(arr, fps, t) {
  const f = clamp(t * fps, 0, arr.length - 1), i = Math.floor(f), j = Math.min(i + 1, arr.length - 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}
