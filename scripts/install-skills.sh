#!/usr/bin/env bash
# Install aim-browser skill suite into an agent host skills directory.
# Destination folder name = skill id (frontmatter name), NOT "aim-foo.skill".
# Usage:
#   ./scripts/install-skills.sh /path/to/project/.grok/skills
#   ./scripts/install-skills.sh "$HOME/.grok/skills" --mode symlink
#   ./scripts/install-skills.sh /path/to/project/.gemini/skills --mode symlink
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"
MODE="${2:-copy}"
if [[ "${2:-}" == "--mode" ]]; then
  MODE="${3:-copy}"
fi

if [[ -z "$DEST" ]]; then
  echo "Usage: $0 <dest-skills-dir> [--mode copy|symlink]" >&2
  echo "Example: $0 \"\$HOME/.grok/skills\" --mode symlink" >&2
  echo "Example: $0 /path/to/project/.gemini/skills --mode symlink" >&2
  exit 1
fi

mkdir -p "$DEST"
shopt -s nullglob
count=0
for skill_dir in "$ROOT"/aim-*.skill; do
  base="$(basename "$skill_dir")"
  # Host-facing name matches SKILL.md frontmatter (strip .skill source suffix)
  name="${base%.skill}"
  target="$DEST/$name"
  rm -rf "$target"
  if [[ "$MODE" == "symlink" ]]; then
    ln -sfn "$skill_dir" "$target"
    echo "symlink $target -> $skill_dir"
  else
    cp -a "$skill_dir" "$target"
    echo "copied  $target"
  fi
  count=$((count + 1))
done
echo "Installed $count skills into $DEST (mode=$MODE)"
echo "Package root: $ROOT"
echo "Run CLIs from the aim-browser package root (or set AIM_BROWSER_ROOT=$ROOT) so src/ imports resolve."
