/**
 * What the preflight *does* once `services-plan.ts` has decided — the order of
 * the steps, which message comes out of which failure, and the exit code.
 *
 * Separate from `ensure-services.ts` so that it can be tested: every action is
 * injected, so a test drives the whole sequence without a container, a daemon
 * or a clock. The entry point is left holding nothing but the wiring.
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

/** The process exit code: 0 lets the guarded command run, 1 stops it. */
export async function runPreflight(actions: PreflightActions): Promise<number> {
  const decision = await actions.decide();

  if (decision.kind === "ready") return 0;

  if (decision.kind === "skip") {
    actions.out(decision.message);
    return 0;
  }

  // Nothing here can be started for the caller: no docker to run, or a target
  // that is somewhere else entirely.
  if (decision.kind === "no-docker" || decision.kind === "remote-unreachable") {
    actions.err(decision.message);
    return 1;
  }

  if (decision.kind === "start-daemon") {
    actions.out("The Docker daemon is not running.");

    /**
     * **Nothing was launched, so there is nothing to wait for.**
     *
     * `startDaemon` reports false on Linux and anywhere else the daemon needs
     * root, and on macOS when the launch itself failed. Entering the wait loop
     * there spent the full 90s polling for a process nobody had started, and
     * then printed a message about it not coming up in time. Caught in review
     * on #402.
     */
    if (!actions.startDaemon()) {
      actions.err(daemonNotStartedMessage());
      return 1;
    }

    actions.out("Starting it — this can take a while…");

    const daemon = await actions.wait(
      async () => actions.dockerIsRunning(),
      actions.daemonTimeoutMs
    );
    if (!daemon.ok) {
      actions.err(daemonUnavailableMessage(daemon.waitedMs));
      return 1;
    }
  }

  /**
   * Reached from both `start-daemon` and `start-containers`: once the daemon is
   * up, a daemon that was down means the containers are down too. Falling
   * through rather than deciding again is what makes "start Docker, then start
   * the containers" one path instead of two that can disagree.
   */
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
