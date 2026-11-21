/**
 * `npm run check:commits`: refuses a commit subject that names the review
 * instead of the change. Nothing runs when this file is imported.
 *
 * decisions/841-commit-subject-gate.md
 */
import { runWhenMain } from "../shared/entry-point";
import { startCheck } from "./commit-subject-steps";

runWhenMain(process.argv, "scripts/hooks/commit-subjects.ts", startCheck);
