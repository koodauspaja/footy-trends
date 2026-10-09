/**
 * `npm run verify`: the whole gate in one command, in the order that fails
 * fastest first, stopping at the first failure. Nothing runs when this file
 * is imported.
 *
 * decisions/401-one-command-for-the-gate.md
 */
import { runWhenMain } from "./entry-point";
import { startVerify } from "./verify-steps";

runWhenMain(process.argv, "scripts/verify.ts", startVerify);
