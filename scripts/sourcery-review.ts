/**
 * `GH_TOKEN=$(gh auth token) npm run check:sourcery -- <pull request number>`:
 * says which kind of Sourcery review the pull request's head has, and fails
 * when that is not enough to hand it off. Nothing runs when this file is
 * imported.
 *
 * decisions/559-sourcery-review-kind.md
 */
import { runWhenMain } from "./entry-point";
import { startCheck } from "./sourcery-review-steps";

runWhenMain(process.argv, "scripts/sourcery-review.ts", startCheck);
