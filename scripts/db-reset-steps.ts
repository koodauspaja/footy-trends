/**
 * The order of a database reset, and what stops it. Every action is injected,
 * so the sequence can be tested without destroying anything.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/404-reset-only-the-compose-database.md
 * decisions/406-safe-and-destructive-resets.md
 */
import {
  COMPOSE_DATABASE_NAME,
  nonInteractiveRefusal,
  postgresUnreachableMessage,
  resetRefusal,
  testResetRefusal,
  type WaitResult,
} from "./services-plan";

/**
 * What the person said, or what the absence of a person means.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export type ConfirmationOutcome = "proceed" | "declined" | "refused";

export type ResetActions = {
  url: string | undefined;
  /** Omitted only by tests that are not exercising the confirmation. */
  confirm?: () => Promise<ConfirmationOutcome>;
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

/**
 * The process exit code.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export async function runReset(actions: ResetActions): Promise<number> {
  // The guard comes first, before Docker is even looked for.
  const refusal = resetRefusal(actions.url);
  if (refusal !== null) {
    actions.err(refusal);
    return 1;
  }

  // Consent before Docker, for the same reason the guard comes first.
  const confirmation = actions.confirm === undefined ? "proceed" : await actions.confirm();
  if (confirmation === "refused") {
    actions.err(nonInteractiveRefusal());
    return 1;
  }
  if (confirmation === "declined") {
    actions.out("Nothing was changed.");
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

  // Said the moment the volume is gone, not at the end, and about the server,
  // not a named database.
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

export type TestResetActions = {
  /** The suites' database, derived or overridden. */
  url: string | undefined;
  /** Drops it, resolving false when the drop itself failed. */
  dropDatabase: (url: string) => Promise<boolean>;
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * Drops the suites' database and stops: no containers, no volume, no
 * migrations.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export async function runTestReset(actions: TestResetActions): Promise<number> {
  const refusal = testResetRefusal(actions.url);
  if (refusal !== null) {
    actions.err(refusal);
    return 1;
  }

  const url = actions.url as string;

  if (!(await actions.dropDatabase(url))) {
    actions.err("Could not drop the test database. Its error is above.");
    return 1;
  }

  actions.out("The test database is gone. The next test run recreates and migrates it.");
  return 0;
}
