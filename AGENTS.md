# Instructions for AI coding assistants

These rules are for Claude, Copilot, Cursor, Codex and any other assistant working in this repo. Humans are
welcome to follow them too. Start with [ARCHITECTURE.md](ARCHITECTURE.md) for the code map.

## Golden rules

1. **Never commit user data.** Recordings, projects, rendered videos and uploaded images live in
   `~/Movies/Demo Recorder/`, outside the repo. Never copy them into the repo, never use `git add -f`, and never
   weaken `.gitignore`, `.githooks/pre-commit`, `scripts/check-no-private-files.sh` or the CI check. If you need
   test media, generate a synthetic recording in a temp folder (see "Testing without a real recording").
2. **Keep the preview and the render in sync.** Layout, transitions and backgrounds exist twice: in Python
   (`demorec/layout.py`, `compose.py`, `export.py`) and in JS (`editor/js/models/*`, `components/stage/stage.js`).
   A change to one needs the matching change to the other. Camera and cursor *paths* are computed only in Python
   and sent to the editor. Don't reimplement them in JS.
3. **Respect the layering.**
   - Python: pure logic (`motion`, `tracking`, `layout`, `camera`, `project`) must not do file or HTTP I/O.
     Pixels belong in `cursor` / `compose` / `clip`, HTTP only in `server/`.
   - JS: `models/` and `utils/` never touch the DOM or `S`. Components talk to each other through
     `state/actions.js`, not by importing each other's internals. Server calls go through `services/api.js`.
4. **One concept, one home.** Before adding a helper, look in `utils/` (JS) or the matching Python module. Reuse
   it rather than duplicating it.
5. **Don't change file formats casually.** `project.json` and `events.json` are user data on disk. If you change
   their shape, keep old files loading: add defaults in `project.with_defaults()`, migrate on load, and bump
   `version`.

## Conventions

- Python 3.11+, standard library + numpy + OpenCV only. Avoid new dependencies unless clearly worth it.
- JS: modern ES modules, no framework, no build step, no npm packages.
- Visual style: calm and monochrome (Mobbin-like). Primary action = white pill with black text, secondary = outlined
  pill, selection = white. Colour only carries meaning: red = recording, orange = clicks. Use the tokens in
  `editor/styles/base.css` and avoid new gradients.
- Testing the record flow without capturing a real screen: set `DEMOREC_RECORDER` to a stand-in script that speaks
  the same CLI and `STATUS …` protocol (see `demorec/server/capture.py`).
- Comments explain *why*, not *what*. Module docstrings and header comments state the file's responsibility.
- Names: Python `snake_case`, JS `camelCase`, files in `kebab-case.js`.
- Match the density and style of the surrounding code. Keep functions small.

## Before you finish a change

```bash
.venv/bin/python -m unittest discover -s tests -t .      # logic tests
for f in $(find editor/js -name '*.js'); do node --check --input-type=module < "$f"; done   # JS syntax
```

- Logic change: add or update a test in `tests/`.
- Rendering change: render a short synthetic project and look at a few frames:
  `ffmpeg -i final.mp4 -vf "select=eq(n\,60)" -frames:v 1 frame.png`.
- Editor change: run `./edit`, try the interaction you changed, and check the browser console for errors.

## Testing without a real recording

A recording is just a folder with `raw.mov` and `events.json`. Make one in a temp directory: render a still UI
image to video with ffmpeg, and write `events.json` with `display` (width_px, height_px, scale) and an `events` list of
`{t, type: move|down|up, x, y}` in pixels. Then render it with `./render /tmp/fake-recording`, or point a project
clip at its absolute path. Run with `DEMOREC_DATA=/tmp/demorec-data` so test projects don't land in the user's
data folder.

## Commit messages

Use the imperative mood ("Add crop presets"). Explain *why* in the body when it isn't obvious.
