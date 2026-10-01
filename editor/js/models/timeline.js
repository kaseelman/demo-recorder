// Clip placement on the project timeline and time mapping. Mirrors demorec/project.py:timeline.

/** Place clips one after another; a transition overlaps the end of the previous clip. */
export function computeTimeline(project, info) {
  let cur = 0, prevLen = 0;
  const entries = project.clips.map((clip, i) => {
    const len = Math.max(0.1, info[clip.id].duration - clip.trim_start - clip.trim_end);
    let d = 0;
    if (i > 0 && clip.transition && clip.transition.type !== 'cut') d = Math.min(clip.transition.duration, len / 2, prevLen / 2);
    cur -= d;
    const e = { clip, i, start: cur, len, d };
    cur += len;
    prevLen = len;
    return e;
  });
  return { entries, total: cur };
}

export const localTime = (e, t) => t - e.start + e.clip.trim_start;     // project time -> recording time
export const globalTime = (e, lt) => e.start + lt - e.clip.trim_start;  // recording time -> project time

/** Clips visible at project time t (two during a transition). */
export function activeAt(entries, total, t) {
  const act = entries.filter((e) => t >= e.start && t < e.start + e.len);
  if (!act.length && entries.length && t >= total - 1e-6) act.push(entries[entries.length - 1]);
  return act;
}
