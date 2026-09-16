/**
 * Talking to Docker: whether it is there, whether it is running, and starting
 * or destroying this project's containers.
 *
 * **Its own module so that importing it costs nothing else.** The pre-push hook
 * needs `dockerIsRunning` and nothing more; keeping these beside the Postgres
 * probe in `services-run.ts` would pull the database driver into every `git
 * push`.
 *
 * **The process spawn is injected**, the way `executable.ts` injects its
 * existence check, so every branch here is testable and the file is not behind a
 * coverage exclusion. Review on #402 asked for that, and it was the right ask:
 * which arguments these pass is worth pinning down. `--volumes` is the
 * difference between restarting the containers and destroying the data in them,
 * and nothing else in the repository would notice if it disappeared.
 */
import { spawnSync } from "node:child_process";
import { executablePath } from "./executable";
import { canStartDaemonAutomatically } from "./services-plan";

/** Just enough of `spawnSync`'s result for the decisions here. */
export type SpawnResult = { status: number | null };

export type DockerDeps = {
  /** Where `docker` lives, or `null` when it cannot be found. */
  find?: () => string | null;
  run?: (command: string, args: readonly string[], options: { inherit: boolean }) => SpawnResult;
};

/**
 * The real spawn. Exported so a test can assert that the options above do not
 * break it and that the child's status is passed through — with a command that
 * is guaranteed present and harmless, rather than with docker.
 */
export function defaultRun(
  command: string,
  args: readonly string[],
  { inherit }: { inherit: boolean }
): SpawnResult {
  return spawnSync(command, [...args], {
    stdio: inherit ? "inherit" : "ignore",
    /**
     * Bounded, because a `docker` CLI installed without a reachable daemon can
     * hang far longer than anyone expects a pre-push hook or a preflight to
     * take. Only the silent probes are bounded — `compose up` is allowed to
     * take as long as pulling an image takes.
     */
    ...(inherit ? {} : { timeout: 5000 }),
  });
}

const DEFAULTS = {
  find: () => executablePath("docker"),
  run: defaultRun,
} as const;

export function dockerAvailable({ find = DEFAULTS.find }: DockerDeps = {}): boolean {
  return find() !== null;
}

/**
 * Whether the daemon answers.
 *
 * A timeout reads as "not running", which is the state the caller acts on
 * anyway. No docker found reads the same way, for the same reason.
 *
 * Lived in `e2e-freshness.ts` until #399, which needed the same question
 * answered the same way and moved it here rather than asking it twice.
 */
export function dockerIsRunning({
  find = DEFAULTS.find,
  run = DEFAULTS.run,
}: DockerDeps = {}): boolean {
  // Absolute, not resolved through `PATH` — see `executable.ts`.
  const binary = find();
  if (binary === null) return false;

  return run(binary, ["info", "--format", "{{.ServerVersion}}"], { inherit: false }).status === 0;
}

/** `docker compose up -d`, with its output shown — starting containers is worth seeing. */
export function startContainers({
  find = DEFAULTS.find,
  run = DEFAULTS.run,
}: DockerDeps = {}): boolean {
  const binary = find();
  if (binary === null) return false;

  return run(binary, ["compose", "up", "-d"], { inherit: true }).status === 0;
}

/**
 * Drops the containers **and their volumes**, which is what makes a reset a
 * reset rather than a restart.
 */
export function destroyContainers({
  find = DEFAULTS.find,
  run = DEFAULTS.run,
}: DockerDeps = {}): boolean {
  const binary = find();
  if (binary === null) return false;

  return run(binary, ["compose", "down", "--volumes"], { inherit: true }).status === 0;
}

/**
 * One attempt at starting the daemon, where that is possible without a password.
 *
 * Which platforms those are is `canStartDaemonAutomatically`'s to say; this only
 * carries it out, and reports `false` where it did not try so the caller can say
 * what to run instead.
 *
 * Detached and unwatched: `open` returns as soon as the application is
 * launching, and the daemon is ready some time later. The wait loop is what
 * decides whether it worked.
 */
export function startDockerDaemon(
  platform: NodeJS.Platform = process.platform,
  { run = DEFAULTS.run }: DockerDeps = {}
): boolean {
  if (!canStartDaemonAutomatically(platform)) return false;

  return run("/usr/bin/open", ["-a", "Docker"], { inherit: false }).status === 0;
}
