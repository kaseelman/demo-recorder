#!/bin/zsh
# One-time setup: Python environment, background presets and the Swift recorder.
set -e
cd "${0:A:h}"
command -v ffmpeg >/dev/null || { echo "Installing ffmpeg with Homebrew…"; brew install ffmpeg; }
[[ -d .venv ]] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
echo "Generating background presets…"
PYTHONPATH=. .venv/bin/python -m demorec.backgrounds >/dev/null
echo "Building the recorder…"
(cd recorder && swift build -c release -q)
if git rev-parse --git-dir >/dev/null 2>&1; then
  git config core.hooksPath .githooks  # blocks accidental commits of recordings and videos
fi
echo "✓ Ready. Record with ./record, then open the editor with ./edit"
