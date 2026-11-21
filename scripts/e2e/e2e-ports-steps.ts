import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { executablePath } from "../shared/executable";
import { type Console, processConsole } from "../shared/github-read";
import {
  listeners,
  type PortHolder,
  portsInUse,
  portsRefusal,
  workingDirectory,
} from "./e2e-ports-plan";
import { e2eAppPort, e2eRedisPort, e2eTasoPort } from "./e2e-target";

/**
 * `pretest:e2e`'s port check: who listens on the ports the run needs, read with
 * `lsof`, judged by `e2e-ports-plan.ts`. Reading is injected.
 *
 * decisions/849-e2e-names-port-holders.md
 */

export type Deps = {
  /** lsof's stdout, `""` when it finds nothing, or `null` when lsof is not installed. */
  lsof: (args: readonly string[]) => string | null;
  /** The git checkout `directory` is in, or `null` outside one. */
  checkoutOf: (directory: string) => string | null;
};

/**
 * Every process listening on `ports`, with the checkout it runs from, or `null`
 * when lsof is not installed.
 *
 * decisions/849-e2e-names-port-holders.md
 */
function holdersOf(ports: readonly number[], deps: Deps): PortHolder[] | null {
  const holders: PortHolder[] = [];
  for (const port of ports) {
    const output = deps.lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]);
    if (output === null) return null;
    for (const { pid, command } of listeners(output)) {
      const directory = workingDirectory(
        deps.lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"]) ?? ""
      );
      const checkout = directory === null ? null : deps.checkoutOf(directory);
      holders.push({ port, pid, command, checkout });
    }
  }
  return holders;
}

/**
 * The check: 0 when the ports are free or lsof is missing, 1 with the refusal
 * when any is held.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function runPortsCheck(
  env: Record<string, string | undefined>,
  cwd: string,
  deps: Deps,
  console: Console
): number {
  const ports = portsInUse(
    { app: e2eAppPort(env), taso: e2eTasoPort(env), redis: e2eRedisPort(env) },
    env.E2E_TASO_STUB === "1"
  );
  const holders = holdersOf(ports, deps);
  if (holders === null) {
    console.out("e2e port check skipped: lsof is not installed.");
    return 0;
  }

  const refusal = portsRefusal(holders, deps.checkoutOf(cwd));
  if (refusal === null) return 0;
  console.err(refusal);
  return 1;
}

function run(binary: string | null, args: readonly string[]): string | null {
  if (binary === null) return null;
  const result = spawnSync(binary, [...args], { encoding: "utf8", timeout: 15_000 });
  return result.status === 0 ? result.stdout : "";
}

export const defaultDeps: Deps = {
  lsof: (args) => run(executablePath("lsof"), args),
  checkoutOf: (directory) => {
    const top = run(executablePath("git"), ["-C", directory, "rev-parse", "--show-toplevel"]);
    return top === null || top === "" ? null : top.trim();
  },
};

/**
 * The exit code `runWhenMain` sets, with `.env` read first, as
 * `playwright.config.ts` reads it.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function startPortsCheck(envFile = ".env"): Promise<number> {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return Promise.resolve(runPortsCheck(process.env, process.cwd(), defaultDeps, processConsole()));
}
