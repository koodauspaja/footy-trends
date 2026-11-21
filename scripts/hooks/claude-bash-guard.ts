/**
 * Claude Code's `PreToolUse` hook on Bash, started by `claude-bash-guard.sh`:
 * refuses a command that breaks a push or pull-request rule. Nothing runs when
 * this file is imported.
 *
 * decisions/806-push-and-pr-hooks.md
 */
import { runWhenMain } from "../shared/entry-point";
import { startGuard } from "./claude-bash-guard-steps";

runWhenMain(process.argv, "scripts/hooks/claude-bash-guard.ts", startGuard);
