/**
 * Which server the end-to-end suite runs against, and what follows from the
 * choice. Free of the filesystem and `process`.
 *
 * decisions/568-e2e-against-a-production-build.md
 */

/**
 * `fresh-build` builds and then serves, `prebuilt` serves a build the caller
 * made, with whatever Sentry DSN it was built with, and `dev` is `next dev`.
 *
 * decisions/568-e2e-against-a-production-build.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
export type E2eTarget = "fresh-build" | "prebuilt" | "dev";

/**
 * Reads `E2E_TARGET`. Unset, or anything unknown, is the build made here: the
 * strictest of the three.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function e2eTarget(value: string | undefined): E2eTarget {
  if (value === "build") return "prebuilt";
  if (value === "dev") return "dev";
  return "fresh-build";
}

/**
 * A port read from the environment: blank is `fallback`, and anything but a whole
 * number from 1 to 65535 stops the run. Ports go into the shell commands
 * Playwright starts, so nothing else may reach them.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
export function e2ePort(name: string, value: string | undefined, fallback: number): number {
  const raw = (value ?? "").trim();
  if (raw === "") return fallback;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
  if (port < 1 || port > 65_535) {
    throw new Error(`${name} must be a port from 1 to 65535, not ${JSON.stringify(raw)}.`);
  }
  return port;
}

/**
 * The command Playwright starts its server with. The port is an argument and
 * not `PORT`, so it holds however `next dev` and `next start` read their
 * environment.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function serverCommand(target: E2eTarget, port: number): string {
  if (target === "dev") return `npm run dev -- -p ${port}`;

  const start = `npm start -- -p ${port}`;
  return target === "fresh-build" ? `npm run build && ${start}` : start;
}

/**
 * How long Playwright waits for the server to answer, which for a fresh build
 * includes the build.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function startUpTimeoutMs(target: E2eTarget): number {
  return target === "fresh-build" ? 300_000 : 120_000;
}

/**
 * Whether a passing run against this target may vouch for a push: only the one
 * that built what it tested.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function vouchesForAPush(target: E2eTarget): boolean {
  return target === "fresh-build";
}

/**
 * The server's environment with no Sentry DSN, so a `fresh-build` or `dev` run
 * reports nothing to Sentry whatever `.env` holds. A `prebuilt` build keeps the
 * DSN it was built with, inlined at build time.
 *
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
export function withoutSentry<Env extends object>(
  env: Env
): Omit<Env, "NEXT_PUBLIC_SENTRY_DSN"> & { NEXT_PUBLIC_SENTRY_DSN: "" } {
  return { ...env, NEXT_PUBLIC_SENTRY_DSN: "" };
}
