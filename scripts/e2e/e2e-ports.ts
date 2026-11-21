/**
 * `pretest:e2e`'s first step: refuses to start e2e while its ports are held,
 * naming who holds them. Nothing runs when this file is imported.
 *
 * decisions/849-e2e-names-port-holders.md
 */
import { runWhenMain } from "../shared/entry-point";
import { startPortsCheck } from "./e2e-ports-steps";

runWhenMain(process.argv, "scripts/e2e/e2e-ports.ts", startPortsCheck);
