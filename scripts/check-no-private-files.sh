#!/bin/sh
# Fails if any of the given files are recordings, projects, videos or large binaries.
# Used by the pre-commit hook (.githooks/pre-commit) and by CI (.github/workflows/checks.yml).
# Usage: scripts/check-no-private-files.sh FILE...
MAX_BYTES=5000000
status=0
for f in "$@"; do
  case "$f" in
    *.mov|*.MOV|*.mp4|*.MP4|*.m4v|*.webm|*.mkv|*.avi|*.gif)
      echo "✗ $f: video files are never committed"; status=1 ;;
    recordings/*|*/recordings/*|projects/*|*/projects/*|*events.json|*project.json|backgrounds/uploads/*|backgrounds/presets/*|backgrounds/thumbs/*)
      echo "✗ $f: recordings, projects and generated/uploaded backgrounds stay local"; status=1 ;;
  esac
  if [ -f "$f" ] && [ "$(wc -c < "$f")" -gt "$MAX_BYTES" ]; then
    echo "✗ $f: larger than 5 MB"; status=1
  fi
done
if [ $status -ne 0 ]; then
  echo
  echo "Your recordings live in ~/Movies/Demo Recorder (outside the repo) and must stay private."
  echo "Unstage the files above with: git restore --staged <file>"
fi
exit $status
