/**
 * `npm run verify` — the whole gate in one command (#401): lint, typecheck, the
 * unit suite, the shuffled unit suite, integration and end-to-end, in the order
 * that fails fastest first, stopping at the first failure.
 *
 * The stages are in `verify-plan.ts` and the sequence in `verify-steps.ts`, both
 * unit tested. Nothing runs when this file is imported: `runWhenMain` starts the
 * gate only when Node was pointed at *this* file.
 */
import { runWhenMain } from "./entry-point";
import { startVerify } from "./verify-steps";

runWhenMain(process.argv, "scripts/verify.ts", startVerify);
