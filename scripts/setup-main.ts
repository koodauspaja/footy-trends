/**
 * `npm run setup` — one command from a fresh clone to a running app (#400).
 * Normally reached through `scripts/setup`, which checks for Node and
 * `docker compose` and installs the dependencies first.
 *
 * The decisions are in `setup-plan.ts`, the sequence in `setup-steps.ts` and
 * the outside world in `setup-wiring.ts`. Nothing runs when this file is
 * imported: `runWhenMain` starts setup only when Node was pointed at *this*
 * file, so the entry point is a tested, unexcluded source file like any other.
 *
 * **Named `setup-main.ts`, not `setup.ts`,** because `scripts/setup` — the shell
 * half — already holds that name. Two files differing only by extension are
 * ambiguous to anything resolving without one: a test importing
 * `scripts/setup` got the shell script and failed on its `#` comments.
 */
import { runWhenMain, startSetup } from "./setup-wiring";

runWhenMain(process.argv, "scripts/setup-main.ts", startSetup);
