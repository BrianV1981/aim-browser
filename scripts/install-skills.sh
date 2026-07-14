#!/usr/bin/env bash
# Install aim-browser skill suite into an agent host skills directory.
# Usage:
#   ./scripts/install-skills.sh /path/to/project/.grok/skills
#   ./scripts/install-skills.sh /path/to/project/.opencode/skills --mode symlink
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"
MODE="${2:-copy}"
if [[ "${2:-}" == "--mode" ]]; then
  MODE="${3:-copy}"
fi

if [[ -z "$DEST" ]]; then
  echo "Usage: $0 <dest-skills-dir> [--mode copy|symlink]" >&2
  echo "Example: $0 /path/to/project/.grok/skills --mode symlink" >&2
  exit 1
fi

mkdir -p "$DEST"
shopt -s nullglob
count=0
for skill_dir in "$ROOT"/aim-*.skill; do
  name="$(basename "$skill_dir")"
  # strip .skill suffix for host folder name? keep full for clarity
  target="$DEST/$name"
  rm -rf "$target"
  if [[ "$MODE" == "symlink" ]]; then
    ln -s "$skill_dir" "$target"
    echo "symlink $target -> $skill_dir"
  else
    cp -a "$skill_dir" "$target"
    echo "copied  $target"
  fi
  count=$((count + 1))
done
echo "Installed $count skills into $DEST (mode=$MODE)"
echo "Run CLIs from aim-browser root so src/ imports resolve, or set NODE_PATH."
