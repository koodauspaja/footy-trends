/**
 * Talking to Docker: whether it is there, whether it is running, and starting
 * or destroying this project's containers.
 *
 * **Its own module so that importing it costs nothing else.** The pre-push hook
 * needs `dockerIsRunning` and nothing more; keeping these beside the Postgres
 * probe in `services-run.ts` would pull the database driver into every `git
 * push`.
 *
 * Not unit tested, and listed in `sonar.coverage.exclusions`: every function
 * either spawns the docker CLI or looks for it on disk, so a test of one would
 * assert against whatever this machine happens to have installed and running.
 * The one rule that is not IO — which platforms can be started without a
 * password — lives in `services-plan.ts` and is tested there.
 */
import { spawnSync } from "node:child_process";
import { executablePath } from "./executable";
import { canStartDaemonAutomatically } from "./services-plan";

export function dockerAvailable(): boolean {
  return executablePath("docker") !== null;
}

/**
 * Bounded, because a `docker` CLI installed without a reachable daemon can hang
 * far longer than anyone expects a pre-push hook or a preflight to take. A
 * timeout reads as "not running", which is the state the caller acts on anyway.
 *
 * Lived in `e2e-freshness.ts` until #399, which needed the same question
 * answered the same way and moved it here rather than asking it twice.
 */
export function dockerIsRunning(): boolean {
  // Absolute, not resolved through `PATH` — see `executable.ts`. No docker
  // found reads exactly as docker not running, which is what this reports.
  const binary = executablePath("docker");
  if (binary === null) return false;

  const probe = spawnSync(binary, ["info", "--format", "{{.ServerVersion}}"], {
    stdio: "ignore",
    timeout: 5000,
  });
  return probe.status === 0;
}

/** `docker compose up -d`, with its output shown — starting containers is worth seeing. */
export function startContainers(): boolean {
  const binary = executablePath("docker");
  if (binary === null) return false;

  const result = spawnSync(binary, ["compose", "up", "-d"], { stdio: "inherit" });
  return result.status === 0;
}

/**
 * Drops the containers **and their volumes**, which is what makes a reset a
 * reset rather than a restart.
 */
export function destroyContainers(): boolean {
  const binary = executablePath("docker");
  if (binary === null) return false;

  const result = spawnSync(binary, ["compose", "down", "--volumes"], { stdio: "inherit" });
  return result.status === 0;
}

/**
 * One attempt at starting the daemon, where that is possible without a password.
 *
 * Which platforms those are is `canStartDaemonAutomatically`'s to say; this
 * only carries it out, and reports `false` where it did not try so the caller
 * can say what to run instead.
 */
export function startDockerDaemon(platform: NodeJS.Platform = process.platform): boolean {
  if (!canStartDaemonAutomatically(platform)) return false;

  // Detached and unwatched: `open` returns as soon as the application is
  // launching, and the daemon is ready some time later. The wait loop is what
  // decides whether it worked.
  const result = spawnSync("/usr/bin/open", ["-a", "Docker"], { stdio: "ignore" });
  return result.status === 0;
}
