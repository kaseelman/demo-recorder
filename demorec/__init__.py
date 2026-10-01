"""demo-recorder: record your screen, then turn it into a polished product demo.

Package layout
  paths        where recordings, projects and backgrounds live
  config       defaults + config.toml loading
  recording    loading a raw recording (video + mouse events)
  motion       springs, smoothing and easing primitives
  tracking     cursor path and button state over time
  camera       zoom planning (auto + hand-edited) and camera simulation
  cursor       cursor styles, sprites and click ripples
  compose      backgrounds, the glass frame and transitions
  clip         renders one recording's content frame by frame
  project      the project model (clips, style, timeline)
  export       turns a project into an mp4
  backgrounds  generates the wallpaper presets
  server/      the local editor backend (editor/ holds the frontend)
  cli          the `render` and `edit` commands
"""
__version__ = "0.2.0"
