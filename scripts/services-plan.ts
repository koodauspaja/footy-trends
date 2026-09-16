/**
 * Whether the local services need starting, and what to say when they cannot
 * be — kept free of the filesystem, the network and `process` so the rule can
 * be tested directly. The split `grant-admin-plan.ts` established.
 *
 * The decision is deliberately separate from the doing: `services-run.ts`
 * probes and spawns, this decides what those answers mean.
 */

/** Where the compose file's Postgres listens when nothing overrides it. */
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
 * **The probes are functions, not booleans, so that the cheap question is the
 * only one usually asked.** Postgres answering is the overwhelmingly common
 * case, and in it nothing should spawn a process at all.
 *
 * This was booleans first, and the caller evaluated all of them eagerly — so
 * `docker info` ran before every `npm run dev` and the preflight cost about
 * 1.6s instead of about 0.3s. The ordering comment was already here, describing
 * something the code did not do. Taking thunks makes the ordering a property of
 * the signature rather than a promise in prose, and lets a test assert that
 * Docker was never asked.
 *
 * Accepting whatever answers also means a Postgres running some other way —
 * Homebrew services, a remote database, a devcontainer — is simply used. This
 * exists to remove a confusing failure, not to insist on one way of running
 * Postgres.
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

  /**
   * **Checked before probing, not after.** `http://localhost:5432/app` names a
   * host and a port, so a Postgres listening there answers `select 1` and the
   * preflight would report ready — for a URL the application cannot use. The
   * question "is the database up" is not meaningful until the string is one a
   * database client could accept. Raised in review on #402.
   */
  if (!isPostgresUrl(url)) {
    return { kind: "not-postgres", message: notPostgresMessage(url) };
  }

  if (await postgresReachable()) return { kind: "ready" };

  /**
   * **A remote target is never answered by starting local containers.**
   *
   * `docker compose up -d` would bind this machine's 5432 with a database that
   * is not the one being connected to, and the probe would go on failing
   * against the remote until the timeout — so the command still fails, sixty
   * seconds later, having also started two containers nobody asked for.
   *
   * Caught in review on #402. The first version checked only whether Postgres
   * answered, which is the right question for a local URL and the wrong one for
   * any other.
   */
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
 * Named `docker compose`, not Docker Desktop.
 *
 * Desktop is one of several runtimes that provide it — this repository's own
 * machines also have Podman, and OrbStack and Colima are common. A message that
 * says "install Docker Desktop" is wrong on those, and a check that looked for
 * the app bundle would be wrong before the message ever printed.
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
 *
 * Deliberately does not name the local containers as a fix: they are not one.
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
 *
 * Distinct from `daemonUnavailableMessage`, which reports a wait: saying "did
 * not come up within 90s" when nothing was ever launched would be false, and
 * would have come after 90s of waiting for it. Caught in review on #402.
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
 * Which connection string a preflight should check.
 *
 * The test suites run against a database derived from `DATABASE_URL` by
 * suffixing the name — same server, so probing `DATABASE_URL` is the same
 * question. But `TEST_DATABASE_URL` overrides that derivation outright, and may
 * name a different server entirely; probing the wrong one would start local
 * containers for a run that never touches them. Caught in review on #402.
 *
 * Only the test entry points pass `forTests`, because `TEST_DATABASE_URL` means
 * nothing to `npm run dev`.
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

/** After the one attempt at starting the daemon has not worked. */
export function daemonUnavailableMessage(waitedMs: number): string {
  return [
    `The Docker daemon did not come up within ${Math.round(waitedMs / 1000)}s.`,
    "",
    "Start it and try again — on macOS `open -a Docker`, or start OrbStack or Colima",
    "if that is what this machine uses.",
  ].join("\n");
}

/** After the containers were started but Postgres never began answering. */
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
 * Host and port alone, never the whole URL.
 *
 * `DATABASE_URL` carries a password, and this string is printed on failure —
 * into a terminal, into CI logs, into a pasted bug report. Nothing needs the
 * credential to locate the problem.
 */
export function describeTarget(url: string): string {
  const parsed = parseTarget(url);
  return parsed === null ? "<unparseable DATABASE_URL>" : `${parsed.host}:${parsed.port}`;
}

export type Target = { host: string; port: number; protocol: string };

/**
 * The host and port to knock on, or `null` when the URL cannot be read.
 *
 * `null` rather than a throw: an unparseable `DATABASE_URL` is a real state a
 * developer can be in, and the preflight's job is to say something useful about
 * it rather than to add a stack trace on top.
 */
export function parseTarget(url: string): Target | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === "") return null;
    /**
     * No validation of the port beyond this, because `new URL` has already done
     * it: a non-numeric or out-of-range port makes the constructor throw, which
     * the catch below turns into `null`. Measured — `h:abc`, `h:70000` and
     * `h:99999999` all raise `ERR_INVALID_URL`.
     *
     * A `Number.isInteger` check here read as prudence and was dead code; lcov
     * reported the condition as never taken, which is how it was found.
     */
    const port = parsed.port === "" ? DEFAULT_POSTGRES_PORT : Number(parsed.port);
    return { host, port, protocol: parsed.protocol };
  } catch {
    return null;
  }
}

/**
 * Whether this platform's Docker daemon can be started without asking for a
 * password.
 *
 * macOS launches Docker Desktop with `open -a`, which needs nothing. Linux
 * starts Docker through the service manager, which wants root — a script that
 * silently asked for a password would be a worse surprise than the message it
 * would have saved. Anywhere else, the honest answer is that we do not know how.
 *
 * Here rather than in `docker.ts` because it is a rule, not a process spawn:
 * keeping it beside the spawn would have put it behind a coverage exclusion,
 * where a rule has no business being.
 */
export function canStartDaemonAutomatically(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

/**
 * The hostnames that mean "this machine", for the reset guard below.
 *
 * A list rather than a pattern. `localhost` and the loopback literals are the
 * only things a local compose setup produces, and anything cleverer — treating
 * a private range as local, say — would start calling a colleague's machine on
 * the office network local.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * The port `docker-compose.yml` publishes Postgres on.
 *
 * Kept honest by `tests/unit/scripts/services-plan.test.ts`, which reads the
 * compose file and fails if the two ever disagree — the constant is a second
 * copy, so it gets a mechanism rather than a comment asking people to remember.
 */
export const COMPOSE_POSTGRES_PORT = 5432;

/**
 * Whether this URL names **the Postgres this repository's compose file runs** —
 * not merely one on this machine.
 *
 * The host alone is not enough, which review caught on #402. A second local
 * Postgres on another port — Homebrew services, another project's containers —
 * passes a hostname check, and then both callers do the wrong thing: the
 * preflight starts compose containers that bind 5432 and cannot help whatever
 * is listening on 6543, and `db:reset` destroys this project's volume while the
 * URL it was pointed at is somewhere else entirely, reporting a fresh database
 * it never touched.
 *
 * Both questions are really this one question, so there is one function for it.
 */
/** What a Postgres connection string may begin with. */
const POSTGRES_SCHEMES = new Set(["postgres:", "postgresql:"]);

/**
 * The connection strings a reachability probe should try, in order.
 *
 * **Two, because either one alone is wrong somewhere.**
 *
 * - The configured database only: a managed Postgres whose user cannot reach
 *   the administrative `postgres` database reads as unreachable although the
 *   application's own database is fine, and the preflight then blocks a command
 *   that would have worked. Raised in review on #402.
 * - `postgres` only: the suite's database may not exist yet — `ensureTestDatabase`
 *   is what creates it — so a `TEST_DATABASE_URL` naming it would read as
 *   unreachable until something else had already run.
 *
 * Either answering means the server is up, which is the only question being
 * asked. The configured database is tried first because it is the one that has
 * to work.
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

/** Whether this string is one a Postgres client could accept at all. */
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

export function runsOnComposeServer(url: string): boolean {
  const target = parseTarget(url);
  if (target === null) return false;

  /**
   * The scheme is checked too, because host and port alone say nothing about
   * what is being addressed: `http://localhost:5432/app` matched both and would
   * have been accepted as the compose database. Raised in review on #402.
   */
  return (
    POSTGRES_SCHEMES.has(target.protocol.toLowerCase()) &&
    LOCAL_HOSTS.has(target.host.toLowerCase()) &&
    target.port === COMPOSE_POSTGRES_PORT
  );
}

/**
 * The database `docker-compose.yml` creates, from its `POSTGRES_DB`.
 *
 * Kept honest by `tests/unit/scripts/services-plan.test.ts`, which reads the
 * compose file and fails if the two disagree — the same mechanism
 * `COMPOSE_POSTGRES_PORT` gets, and for the same reason: it is a second copy.
 */
export const COMPOSE_DATABASE_NAME = "footy-trends";

/**
 * The database the suites use, as `tests/support/test-database.ts` derives it:
 * the development database's name with `_test` appended.
 *
 * Stated here so the reset guard can insist on exactly it, rather than on
 * "anything that is not something else".
 */
export const COMPOSE_TEST_DATABASE_NAME = `${COMPOSE_DATABASE_NAME}_test`;

/**
 * Whether this URL names **the database compose creates**, not merely one on its
 * server.
 *
 * **The distinction is the whole of #404.** `runsOnComposeServer` answers "would
 * starting the compose containers help?", which is what the preflight needs and
 * which is true of every database on that server — `footy-trends_test` included.
 * This answers "is it safe to destroy this and correct to migrate it?", which is
 * true of exactly one.
 *
 * Without it `db:reset` accepted `…:5432/postgres`, `…:5432/footy-trends_test`
 * and anything else on the server, destroyed the compose volume, then migrated
 * whichever database the URL named and reported the reset a success — with the
 * destructive step already done.
 *
 * Reported in review on #402 and dismissed there, because the reply answered a
 * question about which *server* this is. Which *database* it is was always one
 * field away.
 */
export function isComposeDatabase(url: string): boolean {
  if (!runsOnComposeServer(url)) return false;

  return databaseNameOf(url) === COMPOSE_DATABASE_NAME;
}

/**
 * The database a connection string names, decoded.
 *
 * Decoded because this is an identifier rather than a URL component:
 * `…/footy%2Dtrends` addresses a database called `footy-trends`, and comparing
 * the raw path would call that a different one. The same reasoning as
 * `databaseNameFor` in `tests/support/test-database.ts`.
 */
export function databaseNameOf(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

/**
 * Why `db:reset` must not run, or `null` when it may.
 *
 * It drops the volume, so the one thing that must never happen is running it
 * against anything but this machine. The same class of mistake
 * `scripts/grant-admin.ts` designs out by refusing to read `.env` — except the
 * cost here is deleted data rather than an unexpected grant, so this refuses
 * rather than merely insisting the value be explicit.
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

/** Between probes while waiting for something to come up. */
export const POLL_INTERVAL_MS = 500;

export type WaitResult = { ok: boolean; waitedMs: number };

/**
 * Polls `probe` until it answers true or the deadline passes, reporting how
 * long it waited so the caller can say so.
 *
 * **Here, with the clock injected, rather than beside the sockets.** It was in
 * `services-run.ts` at first and therefore behind a coverage exclusion — but a
 * deadline loop is control flow, not IO, and an untested timeout is exactly
 * where an off-by-one lives. Review on #402 made the point; this is the same
 * move as `canStartDaemonAutomatically`.
 *
 * The probe is called **before** the first sleep, so a service that is already
 * up costs no delay at all.
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

    /**
     * **Never sleep past the deadline.** A probe that itself takes time can
     * cross it, and sleeping a further full interval afterwards made the
     * reported wait longer than the timeout that was asked for — so the message
     * said "did not come up within 90s" after rather more than 90s. Caught in
     * review on #402.
     */
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return { ok: false, waitedMs: now() - startedAt };
}

/**
 * Why the **test** database may not be dropped, or `null` when it may.
 *
 * A different question from `resetRefusal`, and deliberately a laxer one. The
 * suites' database belongs to the tooling: `ensureTestDatabase` creates and
 * migrates it, every run rebuilds what it needs, and nobody has state in it
 * worth keeping. So this refuses only two things, and both would destroy
 * somebody's work rather than the tooling's:
 *
 * - **Anything not on the compose server.** `TEST_DATABASE_URL` can point at a
 *   shared or remote Postgres, and dropping a database there is not this
 *   command's business.
 * - **The development database itself.** Deriving the test URL wrongly, or
 *   setting `TEST_DATABASE_URL` to the dev database by mistake, would otherwise
 *   let the safe command destroy the one thing it exists to protect.
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

  /**
   * A string by here, not `string | null`: `runsOnComposeServer` has already
   * parsed this URL successfully, and `databaseNameOf` parses the same one. A
   * fallback for the null read as prudence and was dead code — lcov reported the
   * condition as never taken, which is how it was found.
   */
  const name = databaseNameOf(url) as string;
  if (name === COMPOSE_TEST_DATABASE_NAME) return null;

  /**
   * **One exact name, not "anything that is not the dev database".**
   *
   * An earlier version allowed every database on the compose server on the
   * grounds that none of them is the human's, and refused the development and
   * system databases by name. That was laxer than #406 described — the command
   * resets the suites' database — and it meant a mistyped TEST_DATABASE_URL
   * dropped whatever it happened to name. Raised in review on #407.
   *
   * The development database keeps its own message, because pointing this at it
   * is the likely mistake and "use the other command" is the useful answer.
   */
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

/** What to do about confirming a destructive reset. */
export type Confirmation = "proceed" | "ask" | "refuse";

/**
 * Whether the destructive reset may go ahead, must ask, or cannot.
 *
 * **Refusing when there is nobody to ask is the point.** Without a terminal the
 * prompt cannot be answered, and treating that as consent would make every
 * scripted or agent-driven run a silent destruction of the developer's database
 * — exactly the case the confirmation exists for. `--yes` is how a script says
 * it meant it.
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

/** The prompt, kept beside the rule that decides whether to show it. */
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
 * Whether an answer to the prompt is consent.
 *
 * Only a full `yes`. `y` is what people press to get past a dialog they have
 * stopped reading, and this one destroys data.
 */
export function isAffirmative(answer: string): boolean {
  return answer.trim().toLowerCase() === "yes";
}
