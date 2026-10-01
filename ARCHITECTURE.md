# Architecture

This is the map of the codebase: what each part does, how data flows, and where new code belongs.
Read it before making changes. (AI assistants: also read [AGENTS.md](AGENTS.md).)

## The pipeline

```
record ──► raw.mov + events.json ──► plan camera ──► composite frames ──► final.mp4
 (Swift)    (your data folder)        (Python)        (Python + OpenCV)     (ffmpeg)
                   ▲                       ▲
                   └──── editor (browser) ─┘  edits project.json, previews with the same camera maths
```

1. **Record** (`recorder/`, Swift + ScreenCaptureKit). Captures the screen at native resolution *without* the
   system cursor, and logs every mouse move and click on the same clock.
2. **Plan** (`demorec/camera.py`). Works out the camera after the fact from the click history: where to zoom,
   when, and how to move between targets (eased moves of fixed length). Because it runs afterwards, it can
   start moving *before* a click.
3. **Composite** (`demorec/clip.py`, `compose.py`). For each output frame, warps the recording onto the canvas
   (background + glass frame), moves the camera across the whole canvas, and draws the cursor, ripples and
   motion blur.
4. **Encode** (`demorec/export.py`). Pipes frames to ffmpeg.
5. **Edit** (`editor/` + `demorec/server/`). A browser UI for changing zooms, clips, crop and look. It saves
   `project.json`, and the server sends back camera paths computed by the same Python code the renderer uses.

## Where data lives

| What | Where | In git? |
|---|---|---|
| Code, docs, tests | this repository | yes |
| Recordings (`raw.mov`, `events.json`, `proxy.mp4`) | `~/Movies/Demo Recorder/recordings/` | **never** |
| Projects (`project.json`, rendered `.mp4`) | `~/Movies/Demo Recorder/projects/` | **never** |
| Your uploaded backgrounds | `~/Movies/Demo Recorder/backgrounds/` | **never** |
| Generated wallpaper presets | `backgrounds/presets`, `backgrounds/thumbs` | no (made by `setup.sh`) |

Set `DEMOREC_DATA` to use another data folder. All locations are defined in one place: `demorec/paths.py`.
Three layers keep private files out of the repository: the data folder sits outside it, a pre-commit hook
(`.githooks/pre-commit`, enabled by `setup.sh`) refuses them, and CI (`.github/workflows/checks.yml`) fails any
push or PR that contains them. All three use `scripts/check-no-private-files.sh`.

## Coordinate spaces

These cause most of the confusion, so learn them first:

- **Recording space**: pixels of the captured screen (at the working resolution; previews load at 0.5×).
  Mouse events are in this space.
- **Canvas space**: pixels of the output picture (background + frame + recording). The camera lives here:
  zoom 1 = the whole canvas. `layout.ClipLayout.to_canvas()` / `to_recording()` convert between the two,
  accounting for the clip's **crop** and frame position.
- **Stored zoom blocks** (`project.json` → `clips[].segments`): times in recording seconds, zoom relative to the
  canvas, and `x`/`y` as the point on the *uncropped recording* (0..1) to centre on. That keeps a block pointing at
  the same content when the padding or crop changes.
- **Project time vs recording time**: clips are trimmed and overlap during transitions. `project.timeline()`
  (Python) and `models/timeline.js` (JS) map between them.

## Python package: `demorec/`

Ordered from pure logic to I/O:

| Module | Responsibility | Depends on |
|---|---|---|
| `paths.py` | every filesystem location, data-folder migration | — |
| `config.py` | defaults + `config.toml` | paths |
| `motion.py` | `Tween` (eased fixed-length moves), Gaussian smoothing, easing | — |
| `tracking.py` | cursor path over time (smoothing, click pinning), button state | motion |
| `layout.py` | canvas size, where each clip sits, crop, recording↔canvas mapping | — |
| `camera.py` | automatic zoom planning, zoom blocks ↔ JSON, camera simulation | motion, tracking |
| `recording.py` | loading `raw.mov` + `events.json` | paths |
| `project.py` | project model, defaults, timeline, storage | camera, layout, clip |
| `cursor.py` | cursor sprites (5 styles), ripples | — |
| `compose.py` | backgrounds, glass `Card`, transitions | motion, paths |
| `clip.py` | `ClipRenderer`: one clip's frames (camera warp, cursor, motion blur) | camera, tracking, cursor |
| `export.py` | renders a whole project to mp4 | everything above |
| `backgrounds.py` | generates the wallpaper presets | paths |
| `server/http.py` | HTTP routing, static files, byte-range video | server/api, media |
| `server/api.py` | editor operations (load, save, add recording, upload, render) | project, camera |
| `server/media.py` | preview proxies, recording cache | recording |
| `server/jobs.py` | background render subprocess + progress | — |
| `cli.py` | `render` and `edit` commands | export, server |

Rule of thumb: maths goes in `motion` / `camera` / `layout`, pixels in `cursor` / `compose` / `clip`, files in
`paths` / `recording` / `project`, and HTTP in `server/`.

## Editor: `editor/`

Plain HTML, CSS and ES modules. There is no build step and no framework.

```
editor/
  index.html                 markup only
  styles/                    base, layout, stage, inspector, timeline
  js/
    main.js                  entry: loads the project, wires components, fills in state/actions.js
    config/constants.js      presets, cursor SVGs, limits
    state/store.js           the single shared state object `S` + selection helpers
    state/actions.js         cross-component actions (layout, update, select, changed, …)
    models/                  PURE logic, no DOM: timeline.js, geometry.js, motion.js, background.js
    services/                api.js (server client), autosave.js, playback.js (clock)
    components/
      stage/                 live canvas preview, aim-frame (zoom aiming), crop-box, cursor-svg
      timeline/              timeline-view (drawing + drag), timeline-actions (edits), add-recording-menu
      inspector/             right panel: one file per tab + shared form controls
      selection-bar/         context bar for the selected zoom/clip/transition
      header/                project controls, render controls
    controllers/keyboard.js  global shortcuts
    utils/                   dom.js, math.js, format.js
```

How it runs:

- **State.** Everything mutable lives in `S` (`state/store.js`). Components read it and re-render from it.
- **Actions.** Components never import each other "sideways". When the timeline needs the stage to redraw,
  it calls `actions.update()`. `main.js` connects actions to their implementations at startup.
- **Changes.** Edit `S.project`, then call `actions.changed({ relayout?, redraw?, cursor? })`. That redraws and
  schedules an autosave. The save response carries fresh camera/cursor paths from the server.
- **Preview fidelity.** `models/geometry.js`, `models/motion.js` and the stage CSS mirror `layout.py` and
  `compose.py`. Change one side, change the other. Camera and cursor paths are never computed in JS.

## Tests

`python -m unittest discover -s tests -t .` covers the pure logic: tweens, layout and crop mapping, zoom planning
and JSON round-trips, timeline overlaps. Rendering is checked by eye; attach frames to your PR.
