/**
 * What the preflight does once `services-plan.ts` has decided: the order of
 * the steps, which message comes out of which failure, and the exit code.
 * Every action is injected.
 *
 * decisions/399-local-commands-start-the-database.md
 */
import {
  daemonNotStartedMessage,
  daemonUnavailableMessage,
  type Preflight,
  postgresUnreachableMessage,
  type WaitResult,
} from "./services-plan";

export type PreflightActions = {
  /** The connection string, for the failure message. Never printed whole. */
  url: string;
  decide: () => Promise<Preflight>;
  startDaemon: () => boolean;
  dockerIsRunning: () => boolean;
  startContainers: () => boolean;
  postgresReachable: () => Promise<boolean>;
  wait: (probe: () => Promise<boolean>, timeoutMs: number) => Promise<WaitResult>;
  daemonTimeoutMs: number;
  postgresTimeoutMs: number;
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * The process exit code: 0 lets the guarded command run, 1 stops it.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export async function runPreflight(actions: PreflightActions): Promise<number> {
  const decision = await actions.decide();

  if (decision.kind === "ready") return 0;

  if (decision.kind === "skip") {
    actions.out(decision.message);
    return 0;
  }

  // Nothing here can be started for the caller: no docker to run, or a target
  // that is somewhere else entirely.
  if (
    decision.kind === "no-docker" ||
    decision.kind === "remote-unreachable" ||
    decision.kind === "not-postgres"
  ) {
    actions.err(decision.message);
    return 1;
  }

  if (decision.kind === "start-daemon") {
    actions.out("The Docker daemon is not running.");

    // Nothing was launched, so there is nothing to wait for.
    if (!actions.startDaemon()) {
      actions.err(daemonNotStartedMessage());
      return 1;
    }

    actions.out("Starting it — this can take a while…");

    const daemon = await actions.wait(
      () => Promise.resolve(actions.dockerIsRunning()),
      actions.daemonTimeoutMs
    );
    if (!daemon.ok) {
      actions.err(daemonUnavailableMessage(daemon.waitedMs));
      return 1;
    }
  }

  // Reached from both `start-daemon` and `start-containers`: a daemon that was
  // down means the containers are down too.
  actions.out("Starting the project's containers…");
  if (!actions.startContainers()) {
    actions.err("`docker compose up -d` failed. Its output is above.");
    return 1;
  }

  const ready = await actions.wait(actions.postgresReachable, actions.postgresTimeoutMs);
  if (!ready.ok) {
    actions.err(postgresUnreachableMessage(ready.waitedMs, actions.url));
    return 1;
  }

  actions.out("Postgres is ready.");
  return 0;
}
