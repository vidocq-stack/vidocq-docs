#!/bin/sh
# Preflight for the local Antora build.
#
# antora-playbook-local.yml reaches the sibling repos by relative path
# (../../<repo>/main). That resolves only when this checkout sits exactly one
# level below the vidocq-docs repo directory — i.e. at the same depth as main/.
# A git worktree named after a slashed branch (vidocq-docs/fix/foo/) lands one
# level deeper and every content source silently resolves to nothing: Antora
# then builds a site with the component pages missing instead of failing. This
# script turns that into an early, explicit error.
#
# Worktrees are fine here as long as their directory name is flat
# (vidocq-docs/fix-foo/, not vidocq-docs/fix/foo/); `mani run wt-add` flattens
# it automatically for projects tagged 'flat-worktree'. See the workspace
# docs/working-with-mani-and-worktrees.md, section "Exemptions".

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_dir=$(dirname -- "$repo_root")      # <workspace>/vidocq-docs
workspace=$(dirname -- "$repo_dir")      # <workspace>

# Check exactly the repos the playbook points at, read from the playbook itself
# so the two cannot drift. Falls back to a core set if the parse yields nothing.
repos=$(sed -n 's|^[[:space:]]*- url: \.\./\.\./\([^/][^/]*\)/main[[:space:]]*$|\1|p' \
        "$repo_root/antora-playbook-local.yml" 2>/dev/null || true)
[ -n "$repos" ] || repos="vidocq vauban chappe champollion cassini"

missing=""
for repo in $repos; do
  [ -d "$workspace/$repo/main" ] || missing="$missing $repo"
done

[ -z "$missing" ] && exit 0

echo "check-local-layout: the playbook's content sources do not resolve." >&2
echo >&2
echo "  this checkout    : $repo_root" >&2
echo "  looked for repos : $workspace/<repo>/main" >&2
echo "  not found        :$missing" >&2
echo >&2

# Distinguish the two ways this goes wrong, so the message is actionable.
if [ "$(basename -- "$repo_dir")" != "vidocq-docs" ]; then
  echo "  This checkout is nested too deep: its parent is '$(basename -- "$repo_dir")'," >&2
  echo "  not 'vidocq-docs'. A worktree named after a slashed branch does that." >&2
  echo "  Use a flat worktree directory at the same depth as main/:" >&2
  echo >&2
  echo "    BRANCH=fix/foo mani run wt-add -p vidocq-docs   # creates vidocq-docs/fix-foo/" >&2
  echo >&2
  echo "  see docs/working-with-mani-and-worktrees.md, section 'Exemptions'" >&2
else
  echo "  The layout looks right, so the sibling clones are probably just missing." >&2
  echo "  Run 'mani sync' from the workspace root." >&2
fi

exit 1
