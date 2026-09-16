/**
 * The order of a database reset, and what stops it — separate from
 * `db-reset.ts` so that the sequence can be tested without destroying
 * anything. Every action is injected.
 *
 * This is the one command in the repository that deletes data on purpose, so
 * the thing most worth a test is not the happy path: it is that each refusal
 * happens **before** anything is destroyed.
 */
import {
  COMPOSE_DATABASE_NAME,
  postgresUnreachableMessage,
  resetRefusal,
  type WaitResult,
} from "./services-plan";

export type ResetActions = {
  url: string | undefined;
  dockerAvailable: () => boolean;
  dockerIsRunning: () => boolean;
  destroyContainers: () => boolean;
  startContainers: () => boolean;
  postgresReachable: (url: string) => Promise<boolean>;
  wait: (probe: () => Promise<boolean>, timeoutMs: number) => Promise<WaitResult>;
  migrate: () => Promise<number>;
  postgresTimeoutMs: number;
  out: (line: string) => void;
  err: (line: string) => void;
};

/** The process exit code. */
export async function runReset(actions: ResetActions): Promise<number> {
  /**
   * The guard comes first, before Docker is even looked for.
   *
   * A refusal has to be the first thing that happens, not something reached
   * after a probe that might itself fail and change the path — the point is
   * that there is no sequence of events in which this deletes a volume it was
   * not pointed at.
   */
  const refusal = resetRefusal(actions.url);
  if (refusal !== null) {
    actions.err(refusal);
    return 1;
  }

  if (!actions.dockerAvailable() || !actions.dockerIsRunning()) {
    actions.err(
      "Docker is not running, so there are no containers to reset. Start it and try again."
    );
    return 1;
  }

  actions.out("Removing the containers and their volumes…");
  if (!actions.destroyContainers()) {
    actions.err("`docker compose down --volumes` failed. Its output is above.");
    return 1;
  }

  /**
   * **Said the moment the volume is gone, not at the end.**
   *
   * Everything after this can fail — the containers may not come back, Postgres
   * may not answer, the migrations may not apply — and the data is already gone
   * in every one of those cases. A notice that only printed on success would be
   * missing from exactly the runs where it mattered most. Raised in review on
   * #405.
   *
   * It describes the **server**, not a named database: `TEST_DATABASE_URL` can
   * point the suites somewhere else entirely, so claiming that a particular test
   * database was destroyed would be a guess. What is certainly true is that
   * everything in this volume has gone.
   */
  actions.out(
    `Everything on that server has gone, not only ${COMPOSE_DATABASE_NAME} — the next test run recreates whatever it needs.`
  );

  actions.out("Starting them again…");
  if (!actions.startContainers()) {
    actions.err("`docker compose up -d` failed. Its output is above.");
    return 1;
  }

  // A string by here: `resetRefusal` returns a message for undefined and for
  // empty, and both of those have already returned.
  const url = actions.url as string;

  const ready = await actions.wait(() => actions.postgresReachable(url), actions.postgresTimeoutMs);
  if (!ready.ok) {
    actions.err(postgresUnreachableMessage(ready.waitedMs, url));
    return 1;
  }

  actions.out("Applying migrations…");
  if ((await actions.migrate()) !== 0) {
    actions.err("Migrations failed. Their output is above.");
    return 1;
  }

  actions.out("");
  actions.out("The local database is fresh and migrated.");
  return 0;
}
