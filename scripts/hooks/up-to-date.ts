/**
 * The pre-push hook's check that a pushed branch is up to date with
 * `origin/main`. Nothing runs when this file is imported.
 *
 * decisions/806-push-and-pr-hooks.md
 */
import { runWhenMain } from "../shared/entry-point";
import { startCheck } from "./up-to-date-steps";

runWhenMain(process.argv, "scripts/hooks/up-to-date.ts", startCheck);
