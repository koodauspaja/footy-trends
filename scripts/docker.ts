/**
 * Talking to Docker: whether it is there, whether it is running, and starting
 * or destroying this project's containers. Its own module, so importing it
 * costs nothing else, and the process spawn is injected.
 *
 * decisions/399-local-commands-start-the-database.md
 */
import { spawnSync } from "node:child_process";
import { executablePath } from "./executable";
import { canStartDaemonAutomatically } from "./services-plan";

/**
 * Just enough of `spawnSync`'s result for the decisions here.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export type SpawnResult = { status: number | null };

export type DockerDeps = {
  /** Where `docker` lives, or `null` when it cannot be found. */
  find?: () => string | null;
  run?: (command: string, args: readonly string[], options: { inherit: boolean }) => SpawnResult;
};

/**
 * The real spawn, exported so a test can run it with a command that is
 * guaranteed present and harmless.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function defaultRun(
  command: string,
  args: readonly string[],
  { inherit }: { inherit: boolean }
): SpawnResult {
  return spawnSync(command, [...args], {
    stdio: inherit ? "inherit" : "ignore",
    // Bounded: a `docker` CLI without a reachable daemon can hang. Only the silent
    // probes are; `compose up` may take as long as pulling an image takes.
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
 * Whether the daemon answers. A timeout, or no docker at all, reads as "not
 * running".
 *
 * decisions/399-local-commands-start-the-database.md
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

/**
 * `docker compose up -d`, with its output shown: starting containers is worth
 * seeing.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function startContainers({
  find = DEFAULTS.find,
  run = DEFAULTS.run,
}: DockerDeps = {}): boolean {
  const binary = find();
  if (binary === null) return false;

  return run(binary, ["compose", "up", "-d"], { inherit: true }).status === 0;
}

/**
 * Drops the containers and their volumes, which is what makes a reset a reset
 * and not a restart.
 *
 * decisions/399-local-commands-start-the-database.md
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
 * One attempt at starting the daemon, where that is possible without a
 * password; `false` where it did not try. Detached and unwatched: the wait
 * loop decides whether it worked.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function startDockerDaemon(
  platform: NodeJS.Platform = process.platform,
  { run = DEFAULTS.run }: DockerDeps = {}
): boolean {
  if (!canStartDaemonAutomatically(platform)) return false;

  return run("/usr/bin/open", ["-a", "Docker"], { inherit: false }).status === 0;
}
