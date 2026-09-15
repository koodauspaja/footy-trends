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
  | { kind: "no-docker"; message: string };

export type PreflightInputs = {
  /** `CI` set to anything non-empty, as every runner sets it. */
  ci: boolean;
  /** Whether Postgres will answer a query. */
  postgresReachable: () => Promise<boolean>;
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
  postgresReachable,
  dockerAvailable,
  dockerRunning,
}: PreflightInputs): Promise<Preflight> {
  if (ci) {
    return {
      kind: "skip",
      message: "CI is set — the workflow provides its own services, so nothing is started here.",
    };
  }

  if (await postgresReachable()) return { kind: "ready" };

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

export type Target = { host: string; port: number };

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
    return { host, port };
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

export function isLocalDatabaseUrl(url: string): boolean {
  const target = parseTarget(url);
  return target !== null && LOCAL_HOSTS.has(target.host.toLowerCase());
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

  if (!isLocalDatabaseUrl(url)) {
    return [
      `Refusing to reset ${describeTarget(url)} — it is not this machine.`,
      "",
      "db:reset destroys the database volume. It only ever runs against the local",
      "compose setup; a remote DATABASE_URL is never reset from here.",
    ].join("\n");
  }

  return null;
}
