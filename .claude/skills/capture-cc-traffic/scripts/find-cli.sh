#!/usr/bin/env bash
# Resolve the path of the actual Claude Code CLI implementation so anchor-
# searches inside it work regardless of how the user installed it.
#
# Output: a single path on stdout, which is one of:
#   (a) cli.js — for CLI <~2.1.166 that ships the bundled JS source directly
#   (b) The platform-specific native ELF/Mach-O binary — for 2.1.167+ which
#       ships a Bun-compiled single-executable. The wrapper package's
#       postinstall copies the platform binary into bin/claude.exe; if that
#       step ran, that file is itself the target. If postinstall was skipped
#       (npm --ignore-scripts), the binary still exists under the optional
#       platform subpackage and we locate it there.
#
# Exit code 0 on success, 1 if nothing usable was found.
#
# Why this exists: the path differs wildly between fnm / nvm / system npm
# installs and between major CLI release styles. Hardcoding any one breaks
# the rest. We consult ``command -v claude`` (which respects PATH the way
# the user's shell does) and follow the real install layout from there.

set -euo pipefail

claude_bin="$(command -v claude 2>/dev/null || true)"
if [[ -z "$claude_bin" ]]; then
  echo "claude binary not in PATH" >&2
  exit 1
fi
claude_bin="$(readlink -f "$claude_bin")"

# Helper: a path is "the real CLI implementation" if it's the JS bundle, or
# if it's a substantial binary (anything tiny is the placeholder stub that
# ships in the wrapper package when postinstall didn't run).
is_real_implementation() {
  local p="$1"
  [[ -f "$p" ]] || return 1
  case "$p" in
    */cli.js) return 0 ;;
  esac
  local size
  size=$(stat -c '%s' "$p" 2>/dev/null || stat -f '%z' "$p" 2>/dev/null || echo 0)
  # Stub fallback launcher is <2KB; real binary is >>10MB.
  [[ "$size" -gt 1048576 ]]
}

# Case (a) and (b)-postinstalled: the resolved claude entry is already it.
if is_real_implementation "$claude_bin"; then
  echo "$claude_bin"
  exit 0
fi

# Case (b)-no-postinstall: search the optional platform subpackages. They
# live either as siblings of the wrapper package, or nested inside its own
# node_modules, depending on how npm hoisted the install.
pkg_dir="$(dirname "$(dirname "$claude_bin")")"  # strip /bin/<entry>

case "$(uname -s)" in
  Linux) plat=linux ;;
  Darwin) plat=darwin ;;
  *) plat="$(uname -s | tr '[:upper:]' '[:lower:]')" ;;
esac
case "$(uname -m)" in
  x86_64 | x64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) arch="$(uname -m)" ;;
esac

# Candidate roots to look for @anthropic-ai/claude-code-<plat>-<arch>(-musl)
candidates=(
  "$pkg_dir/node_modules/@anthropic-ai/claude-code-${plat}-${arch}"
  "$pkg_dir/node_modules/@anthropic-ai/claude-code-${plat}-${arch}-musl"
  "$(dirname "$pkg_dir")/claude-code-${plat}-${arch}"
  "$(dirname "$pkg_dir")/claude-code-${plat}-${arch}-musl"
)

for root in "${candidates[@]}"; do
  for path in "$root/claude" "$root/bin/claude"; do
    if is_real_implementation "$path"; then
      echo "$(readlink -f "$path")"
      exit 0
    fi
  done
done

# Last-resort: cli.js sibling (transitional builds).
if [[ -f "$pkg_dir/cli.js" ]]; then
  echo "$(readlink -f "$pkg_dir/cli.js")"
  exit 0
fi

echo "could not locate cli.js or native claude binary from $claude_bin" >&2
exit 1
