/**
 * `npm run setup`: one command from a fresh clone to a running app, normally
 * reached through `scripts/setup`. Nothing runs when this file is imported.
 *
 * decisions/400-one-command-setup.md
 */
import { runWhenMain } from "./entry-point";
import { startSetup } from "./setup-wiring";

runWhenMain(process.argv, "scripts/setup-main.ts", startSetup);
