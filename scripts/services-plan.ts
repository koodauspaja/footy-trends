/**
 * Whether the local services need starting, and what to say when they cannot
 * be. Free of the filesystem, the network and `process`: `services-run.ts`
 * probes and spawns, this decides what those answers mean.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/400-one-command-setup.md
 * decisions/404-reset-only-the-compose-database.md
 * decisions/406-safe-and-destructive-resets.md
 */

/**
 * Where the compose file's Postgres listens when nothing overrides it.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export const DEFAULT_POSTGRES_PORT = 5432;

export type Preflight =
  /** CI provides its own services; touching Docker there is wrong, not merely unnecessary. */
  | { kind: "skip"; message: string }
  /** Postgres answered. Nothing to do, which is the common case. */
  | { kind: "ready" }
  /** The daemon is up but the database is not — start the project's containers. */
  | { kind: "start-containers" }
  /** The daemon itself is down. Worth one attempt before giving up. */
  | { kind: "start-daemon" }
  /** No `docker` to run at all, so nothing here can help. */
  | { kind: "no-docker"; message: string }
  /** The connection string is not one Postgres could use. */
  | { kind: "not-postgres"; message: string }
  /** The target is somewhere else, so the local containers are not the answer. */
  | { kind: "remote-unreachable"; message: string };

export type PreflightInputs = {
  /** `CI` set to anything non-empty, as every runner sets it. */
  ci: boolean;
  /** The connection string being guarded, for the scheme check. */
  url: string;
  /** Whether Postgres will answer a query. */
  postgresReachable: () => Promise<boolean>;
  /** Whether `DATABASE_URL` names this machine — the compose containers' own address. */
  targetIsLocal: boolean;
  /** Whether a `docker` binary was found. */
  dockerAvailable: () => boolean;
  /** Whether `docker info` answers, so the daemon is up. */
  dockerRunning: () => boolean;
};

/**
 * What a preflight should do. The probes are functions, not booleans, so the
 * cheap question is the only one usually asked; a Postgres that answers is
 * used, however it is run.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export async function decidePreflight({
  ci,
  url,
  postgresReachable,
  targetIsLocal,
  dockerAvailable,
  dockerRunning,
}: PreflightInputs): Promise<Preflight> {
  if (ci) {
    return {
      kind: "skip",
      message: "CI is set — the workflow provides its own services, so nothing is started here.",
    };
  }

  // Checked before probing, not after: a Postgres listening at the host and port
  // of `http://localhost:5432/app` would answer for a URL the app cannot use.
  if (!isPostgresUrl(url)) {
    return { kind: "not-postgres", message: notPostgresMessage(url) };
  }

  if (await postgresReachable()) return { kind: "ready" };

  // A remote target is never answered by starting local containers.
  if (!targetIsLocal) {
    return { kind: "remote-unreachable", message: remoteUnreachableMessage() };
  }

  if (!dockerAvailable()) {
    return {
      kind: "no-docker",
      message: noDockerMessage(),
    };
  }

  return dockerRunning() ? { kind: "start-containers" } : { kind: "start-daemon" };
}

/**
 * The message when `docker compose` is missing. It names `docker compose`, not
 * Docker Desktop, which is one of several runtimes that provide it.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function noDockerMessage(): string {
  return [
    "No `docker` command found, and the database is not reachable.",
    "",
    "This project's Postgres and Redis come from docker-compose.yml, so it needs a",
    "runtime that provides `docker compose` — Docker Desktop, OrbStack and Colima",
    "all do. See INSTALL.md.",
    "",
    "If docker is installed somewhere unusual, set DOCKER_EXECUTABLE to its absolute path.",
  ].join("\n");
}

/**
 * When `DATABASE_URL` points somewhere else and that somewhere is not answering.
 * It does not name the local containers as a fix: they are not one.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function remoteUnreachableMessage(): string {
  return [
    "DATABASE_URL does not name this project's database, and it is not answering.",
    "",
    `The compose containers are only started for localhost:${COMPOSE_POSTGRES_PORT}, which is what they`,
    "publish. Starting them for anything else would bind that port with a database",
    "nobody is connecting to, and the command would still fail. Check the target, or",
    "point DATABASE_URL at the compose setup.",
  ].join("\n");
}

/**
 * When the daemon is down and this platform cannot be asked to start it.
 * Distinct from `daemonUnavailableMessage`, which reports a wait.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function daemonNotStartedMessage(): string {
  return [
    "The Docker daemon is not running, and it could not be started from here.",
    "",
    "Start it and try again — with `open -a Docker` on macOS, your service manager",
    "on Linux, or OrbStack or Colima if that is what this machine uses.",
  ].join("\n");
}

/**
 * Which connection string a preflight should check: `TEST_DATABASE_URL` when a
 * test entry point passes `forTests` and it is set, else `DATABASE_URL`.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function effectiveDatabaseUrl({
  forTests,
  testUrl,
  databaseUrl,
}: {
  forTests: boolean;
  testUrl: string | undefined;
  databaseUrl: string | undefined;
}): string {
  const override = (testUrl ?? "").trim();
  if (forTests && override !== "") return override;
  return (databaseUrl ?? "").trim();
}

/**
 * After the one attempt at starting the daemon has not worked.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function daemonUnavailableMessage(waitedMs: number): string {
  return [
    `The Docker daemon did not come up within ${Math.round(waitedMs / 1000)}s.`,
    "",
    "Start it and try again — on macOS `open -a Docker`, or start OrbStack or Colima",
    "if that is what this machine uses.",
  ].join("\n");
}

/**
 * After the containers were started but Postgres never began answering.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function postgresUnreachableMessage(waitedMs: number, url: string): string {
  return [
    `Postgres did not accept a connection within ${Math.round(waitedMs / 1000)}s of starting the containers.`,
    "",
    `Tried: ${describeTarget(url)}`,
    "",
    "Check `docker compose ps` and `docker compose logs postgres`. A mismatch between",
    "FOOTY_POSTGRES_PASSWORD and the password in DATABASE_URL looks exactly like this.",
  ].join("\n");
}

/**
 * Host and port alone, never the whole URL: `DATABASE_URL` carries a password,
 * and this string is printed on failure.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function describeTarget(url: string): string {
  const parsed = parseTarget(url);
  return parsed === null ? "<unparseable DATABASE_URL>" : `${parsed.host}:${parsed.port}`;
}

export type Target = { host: string; port: number; protocol: string };

/**
 * The host and port to knock on, or `null` when the URL cannot be read.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function parseTarget(url: string): Target | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === "") return null;
    // No validation of the port beyond this: `new URL` throws on a non-numeric or
    // out-of-range port, which the catch below turns into `null`.
    const port = parsed.port === "" ? DEFAULT_POSTGRES_PORT : Number(parsed.port);
    return { host, port, protocol: parsed.protocol };
  } catch {
    return null;
  }
}

/**
 * Whether this platform's Docker daemon can be started without asking for a
 * password: macOS yes, Linux and anywhere else no.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function canStartDaemonAutomatically(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

/**
 * The hostnames that mean "this machine", for the reset guard below. A list,
 * not a pattern.
 *
 * decisions/399-local-commands-start-the-database.md
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * The port `docker-compose.yml` publishes Postgres on. A test reads the compose
 * file and fails if the two disagree.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export const COMPOSE_POSTGRES_PORT = 5432;

/**
 * What a Postgres connection string may begin with.
 *
 * decisions/399-local-commands-start-the-database.md
 */
const POSTGRES_SCHEMES = new Set(["postgres:", "postgresql:"]);

/**
 * The connection strings a reachability probe should try, in order: the
 * configured database, then `postgres`. Either answering means the server is up.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function probeUrls(url: string): string[] {
  if (parseTarget(url) === null) return [];

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminUrl = admin.toString();

  // Identical when DATABASE_URL already names `postgres`; probing twice would
  // double the wait on a server that is simply down.
  return adminUrl === url ? [url] : [url, adminUrl];
}

/**
 * Whether this string is one a Postgres client could accept at all.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function isPostgresUrl(url: string): boolean {
  const target = parseTarget(url);
  return target !== null && POSTGRES_SCHEMES.has(target.protocol.toLowerCase());
}

export function notPostgresMessage(url: string): string {
  return [
    `DATABASE_URL is not a Postgres connection string: ${describeTarget(url)}`,
    "",
    "It must begin with postgres:// or postgresql://. Nothing is probed or started",
    "until it does — a host and a port alone are not enough to tell whether the",
    "database the application needs is up.",
  ].join("\n");
}

/**
 * Whether this URL names the Postgres this repository's compose file runs, not
 * merely one on this machine: scheme, host and port all have to match.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function runsOnComposeServer(url: string): boolean {
  const target = parseTarget(url);
  if (target === null) return false;

  // The scheme is checked too: host and port alone say nothing about what is
  // being addressed.
  return (
    POSTGRES_SCHEMES.has(target.protocol.toLowerCase()) &&
    LOCAL_HOSTS.has(target.host.toLowerCase()) &&
    target.port === COMPOSE_POSTGRES_PORT
  );
}

/**
 * The database `docker-compose.yml` creates, from its `POSTGRES_DB`. A test
 * reads the compose file and fails if the two disagree.
 *
 * decisions/404-reset-only-the-compose-database.md
 */
export const COMPOSE_DATABASE_NAME = "footy-trends";

/**
 * The user `docker-compose.yml` creates, from its `POSTGRES_USER`. Kept honest
 * the same way as the two constants above.
 *
 * decisions/400-one-command-setup.md
 */
export const COMPOSE_POSTGRES_USER = "postgres";

/**
 * The database the suites use, as `tests/support/test-database.ts` derives it:
 * the development database's name with `_test` appended.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export const COMPOSE_TEST_DATABASE_NAME = `${COMPOSE_DATABASE_NAME}_test`;

/**
 * Whether this URL names the database compose creates, not merely one on its
 * server: safe to destroy and correct to migrate is true of exactly one.
 *
 * decisions/404-reset-only-the-compose-database.md
 */
export function isComposeDatabase(url: string): boolean {
  if (!runsOnComposeServer(url)) return false;

  return databaseNameOf(url) === COMPOSE_DATABASE_NAME;
}

/**
 * The database a connection string names, decoded: it is an identifier, not a
 * URL component.
 *
 * decisions/404-reset-only-the-compose-database.md
 */
export function databaseNameOf(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

/**
 * Why `db:reset` must not run, or `null` when it may. It drops the volume, so
 * it refuses anything but the compose database on this machine.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/404-reset-only-the-compose-database.md
 */
export function resetRefusal(url: string | undefined): string | null {
  if (url === undefined || url.trim() === "") {
    return "DATABASE_URL is not set, so there is nothing to reset. Set it in .env.";
  }

  if (!isComposeDatabase(url)) {
    const named = databaseNameOf(url);

    return [
      `Refusing to reset ${describeTarget(url)}/${named ?? "?"} — that is not this project's database.`,
      "",
      "db:reset destroys the compose volume and then migrates, so it only runs against",
      `the database compose creates: postgres://…@localhost:${COMPOSE_POSTGRES_PORT}/${COMPOSE_DATABASE_NAME}`,
      "",
      "A remote host, another port, another database on the same server — including",
      `${COMPOSE_DATABASE_NAME}_test — are all refused, because the migrations would land in the`,
      "wrong one after the volume had already gone.",
    ].join("\n");
  }

  return null;
}

/**
 * Between probes while waiting for something to come up.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export const POLL_INTERVAL_MS = 500;

export type WaitResult = { ok: boolean; waitedMs: number };

/**
 * Polls `probe` until it answers true or the deadline passes, reporting how
 * long it waited. The probe is called before the first sleep, and the clock
 * is injected.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export async function waitFor(
  probe: () => Promise<boolean>,
  timeoutMs: number,
  {
    now = () => Date.now(),
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    intervalMs = POLL_INTERVAL_MS,
  }: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    intervalMs?: number;
  } = {}
): Promise<WaitResult> {
  const startedAt = now();

  while (now() - startedAt < timeoutMs) {
    if (await probe()) return { ok: true, waitedMs: now() - startedAt };

    // Never sleep past the deadline: a probe that itself takes time can cross it.
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return { ok: false, waitedMs: now() - startedAt };
}

/**
 * Why the test database may not be dropped, or `null` when it may. Laxer than
 * `resetRefusal`: it refuses anything not on the compose server, and anything
 * but the one test database.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export function testResetRefusal(url: string | undefined): string | null {
  if (url === undefined || url.trim() === "") {
    return "No test database URL to reset. Set DATABASE_URL in .env, or TEST_DATABASE_URL to override it.";
  }

  if (!runsOnComposeServer(url)) {
    return [
      `Refusing to drop ${describeTarget(url)} — that is not this project's Postgres.`,
      "",
      `Only the suites' database on the compose server (localhost:${COMPOSE_POSTGRES_PORT}) is dropped`,
      "from here. TEST_DATABASE_URL points somewhere else.",
    ].join("\n");
  }

  // A string by here, not `string | null`: `runsOnComposeServer` has already
  // parsed this URL.
  const name = databaseNameOf(url) as string;
  if (name === COMPOSE_TEST_DATABASE_NAME) return null;

  // One exact name, not "anything that is not the dev database". The development
  // database keeps its own message, as pointing this at it is the likely mistake.
  if (name === COMPOSE_DATABASE_NAME) {
    return [
      `Refusing to drop ${COMPOSE_DATABASE_NAME} — that is the development database, not the suites'.`,
      "",
      "This command exists to reset what the tooling owns. To throw away your own",
      "local data, run `npm run db:reset:dev`, which asks first.",
    ].join("\n");
  }

  return [
    `Refusing to drop ${name} — this command resets ${COMPOSE_TEST_DATABASE_NAME}, nothing else.`,
    "",
    "Check TEST_DATABASE_URL. Anything else on that server, Postgres's own",
    "databases included, is left alone.",
  ].join("\n");
}

/**
 * What to do about confirming a destructive reset.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export type Confirmation = "proceed" | "ask" | "refuse";

/**
 * Whether the destructive reset may go ahead, must ask, or cannot. Without a
 * terminal there is nobody to ask, so it refuses; `--yes` is how a script says
 * it meant it.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export function decideConfirmation({
  yes,
  interactive,
}: {
  yes: boolean;
  interactive: boolean;
}): Confirmation {
  if (yes) return "proceed";
  return interactive ? "ask" : "refuse";
}

/**
 * The prompt, kept beside the rule that decides whether to show it.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export function confirmationPrompt(): string {
  return `This destroys the local ${COMPOSE_DATABASE_NAME} database and everything else on that server. Type "yes" to continue: `;
}

export function nonInteractiveRefusal(): string {
  return [
    "Refusing to destroy the development database without confirmation.",
    "",
    "There is no terminal to ask, so this is either a script or an agent. Pass --yes",
    "to say you meant it, or run `npm run db:reset` instead, which resets only the",
    "suites' database and asks nobody.",
  ].join("\n");
}

/**
 * Whether an answer to the prompt is consent. Only a full `yes`.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export function isAffirmative(answer: string): boolean {
  return answer.trim().toLowerCase() === "yes";
}
