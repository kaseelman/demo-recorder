// Cross-module actions. main.js fills this in at startup, so views can trigger each other
// (e.g. the timeline asking the stage to redraw) without circular imports.
export const app = {
  layout: () => {},        // recompute timeline + stage geometry, redraw everything
  update: () => {},        // redraw the stage and playhead for the current time
  drawTimeline: () => {},
  drawSelectionBar: () => {},
  renderPanel: () => {},
  rebuildCards: () => {},
  seek: (t) => {},
  select: (sel, redraw) => {},
  changed: (opts) => {},   // mark the project dirty and schedule a save
};
