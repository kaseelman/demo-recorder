// The single shared editor state. Modules read and mutate it; views re-render from it.

export const S = {
  id: null,          // project id
  server: null,      // static lists from the server: projects, recordings, backgrounds, defaults…
  project: null,     // the project being edited (saved as project.json)
  info: {},          // clip id -> recording info: duration, size, clicks, cursor path, camera path
  timeline: [],      // computed clip placement: [{clip, i, start, len, d}]
  total: 0,          // project length (s)
  sel: null,         // {kind:'zoom', clip, sid} | {kind:'clip', clip} | {kind:'trans', clip}
  t: 0,              // playhead (s)
  playing: false,
  cropping: null,    // clip id while the crop tool is open
  stage: { w: 0, h: 0 },
  pxPerSec: 10,
};

let nextSid = 1;
/** Zoom blocks get a session-only id so they can be selected; stripped before saving. */
export const tagSegment = (s) => { s._id = nextSid++; return s; };

export const clipById = (id) => S.project.clips.find((c) => c.id === id);
export const entryOf = (id) => S.timeline.find((e) => e.clip.id === id);

export function selectedSegment() {
  if (!S.sel || S.sel.kind !== 'zoom') return null;
  const c = clipById(S.sel.clip);
  return c && c.segments.find((s) => s._id === S.sel.sid);
}
