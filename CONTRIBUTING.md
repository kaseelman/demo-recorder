# Contributing

Thanks for helping make demo-recorder better. Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
./setup.sh                                   # venv, background presets, Swift recorder
.venv/bin/python -m unittest discover -s tests -t .
./edit                                       # editor at http://127.0.0.1:8765
```

There's no frontend build step. `editor/` is plain HTML, CSS and ES modules served by `demorec/server`, so reload
the browser to see changes. Python changes need a restart of `./edit`.

## Where things go

The code is split by responsibility. Please keep it that way:

- **Pure logic** (maths, planning, data) never touches I/O or the DOM. Python examples are `motion.py`, `camera.py`,
  `layout.py` and `project.py`. The JS equivalent is `editor/js/model.js`. These are the easiest to unit-test.
- **Rendering** (pixels) lives in `cursor.py`, `compose.py` and `clip.py`. `export.py` drives a whole project
  through them and encodes the result.
- **The server** (`demorec/server/`) only translates HTTP into calls to `api.py`. Editor operations belong in `api.py`,
  routing in `http.py`.
- **Editor views** each own one area of the page (`stage.js`, `timeline.js`, `inspector.js`, `selection-bar.js`).
  Shared state is in `state.js`. Views call each other through `app.js` to avoid import cycles.

The editor preview and the renderer must agree. If you change the layout, the camera or a transition in Python,
mirror it in `editor/js/model.js` and `stage.js` (each has a comment pointing at its counterpart). Camera and
cursor paths are computed by the server, so they always match.

## Pull requests

- Keep each PR focused, and describe what changed and how you checked it. For visual changes, attach a
  before/after frame or a short clip.
- Add or update tests in `tests/` for logic changes.
- Match the surrounding style: small functions, docstrings that explain *why*, no unused code.
- Never commit recordings or projects. They're git-ignored for a reason.

## License of contributions

By contributing you agree that your contribution is licensed under the project's
[PolyForm Noncommercial 1.0.0](LICENSE.md) license.
