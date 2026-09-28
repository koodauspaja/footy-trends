/**
 * `npm run check:boxes -- <pull request number>` — fails when a checkbox on an
 * issue this pull request closes is neither ticked nor explained (#463).
 *
 *   GH_TOKEN=$(gh auth token) npm run check:boxes -- 464
 *
 * The rule is in `issue-boxes-plan.ts` and the sequence in
 * `issue-boxes-steps.ts`, both unit tested. Nothing runs when this file is
 * imported: `runWhenMain` starts the check only when Node was pointed at *this*
 * file.
 */
import { runWhenMain } from "./entry-point";
import { startCheck } from "./issue-boxes-steps";

runWhenMain(process.argv, "scripts/issue-boxes.ts", startCheck);
