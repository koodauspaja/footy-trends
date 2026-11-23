/**
 * `GH_TOKEN=$(gh auth token) npm run check:sourcery -- <pull request number>`:
 * says which kind of Sourcery review the head has, and fails when that is not
 * enough to hand off. Nothing runs when this file is imported.
 *
 * decisions/597-check-sourcery.md
 */
import { runWhenMain } from "../shared/entry-point";
import { startCheck } from "./sourcery-review-steps";

runWhenMain(process.argv, "scripts/checks/sourcery-review.ts", startCheck);
