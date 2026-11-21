#!/bin/sh
# Claude Code's PreToolUse hook on Bash (.claude/settings.json): hands a command
# to claude-bash-guard.ts only when its text could break a rule, so every other
# command is spared tsx's start-up. Exit code 2 from the guard blocks the call.
# decisions/806-push-and-pr-hooks.md
input=$(cat)
case "$input" in
  *"gh pr "* | *"git "*" add"*) ;;
  *) exit 0 ;;
esac

root=${CLAUDE_PROJECT_DIR:-.}
tsx="$root/node_modules/.bin/tsx"
if [ ! -x "$tsx" ]; then
  echo "claude-bash-guard skipped: run npm install to enable it." >&2
  exit 0
fi

printf '%s' "$input" | "$tsx" "$root/scripts/hooks/claude-bash-guard.ts"
