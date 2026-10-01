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

[ARCHITECTURE.md](ARCHITECTURE.md) has the full map. In short:

- **Pure logic** (maths, planning, data) never does I/O or touches the DOM. In Python that means `motion.py`, `camera.py`,
  `layout.py` and `project.py`. In JS it means `editor/js/models/` and `utils/`. These are the easiest to unit-test.
- **Rendering** (pixels) lives in `cursor.py`, `compose.py` and `clip.py`. `export.py` drives a whole project.
- **Server**: `demorec/server/http.py` only routes. Editor operations live in `api.py`.
- **Editor**: one folder per screen area under `editor/js/components/`. Shared state is in `state/store.js`, and components
  talk to each other through `state/actions.js`. Server calls go through `services/api.js`.

The editor preview and the renderer must agree: if you change layout, transitions or backgrounds in Python, mirror it in
`editor/js/models/` and the stage. Camera and cursor paths always come from the server.

Using an AI assistant? Point it at [AGENTS.md](AGENTS.md).

## Keep recordings out of the repo

Your data lives in `~/Movies/Demo Recorder/`. `setup.sh` enables a pre-commit hook that refuses video files, recordings and
projects, and CI checks the same. Please don't bypass them (`--no-verify`). For test media, generate a synthetic
recording (see AGENTS.md).

## Pull requests

- Keep each PR focused, and describe what changed and how you checked it. For visual changes, attach a
  before/after frame or a short clip.
- Add or update tests in `tests/` for logic changes.
- Match the surrounding style: small functions, docstrings that explain *why*, no unused code.

## License of contributions

By contributing you agree that your contribution is licensed under the project's
[PolyForm Noncommercial 1.0.0](LICENSE.md) license.
