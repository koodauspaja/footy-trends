/**
 * `GH_TOKEN=$(gh auth token) npm run check:boxes -- <pull request number>`:
 * fails when a checkbox on an issue the pull request closes is neither ticked
 * nor explained. Nothing runs when this file is imported.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
import { runWhenMain } from "./entry-point";
import { startCheck } from "./issue-boxes-steps";

runWhenMain(process.argv, "scripts/issue-boxes.ts", startCheck);
