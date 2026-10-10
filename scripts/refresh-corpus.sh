#!/usr/bin/env bash
# Refresh tests/corpus from the two pilot sites. Overwrites existing files, never deletes.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
projects="${PROJECTS_DIR:-$root/..}"

rsync -aL --include='*/' --include='*.md' --exclude='*' \
	"$projects/digi-handboek/docs/" "$root/tests/corpus/digi-handboek/"

rsync -aL --exclude='documenten/' --include='*/' --include='*.md' --exclude='*' \
	"$projects/moza/moza-site/main/content/" "$root/tests/corpus/moza-site/"
