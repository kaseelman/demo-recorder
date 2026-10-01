// Cross-component actions. main.js fills these in at startup, so components can trigger each
// other (e.g. the timeline asking the stage to redraw) without importing each other.
export const actions = {
  layout: () => {},          // recompute timeline + stage geometry, redraw everything
  update: () => {},          // redraw stage and playhead for the current time
  drawTimeline: () => {},
  drawSelectionBar: () => {},
  followPlayhead: () => {},  // keep the playhead visible in the timeline while playing
  renderPanel: () => {},
  rebuildCards: () => {},
  seek: (t) => {},
  select: (sel, redraw) => {},
  changed: (opts) => {},     // mark the project dirty and schedule a save
};
