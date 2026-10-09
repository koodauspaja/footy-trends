/**
 * Which server the end-to-end suite runs against, and what follows from the
 * choice. Free of the filesystem and `process`.
 *
 * decisions/568-e2e-against-a-production-build.md
 */

/**
 * `fresh-build` builds and then serves, `prebuilt` serves a build the caller
 * made, and `dev` is `next dev`.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export type E2eTarget = "fresh-build" | "prebuilt" | "dev";

/**
 * Reads `E2E_TARGET`. Unset, or anything unknown, is the build made here: the
 * slowest and strictest of the three.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function e2eTarget(value: string | undefined): E2eTarget {
  if (value === "build") return "prebuilt";
  if (value === "dev") return "dev";
  return "fresh-build";
}

/**
 * The command Playwright starts its server with. The port is an argument and
 * not `PORT`, so it holds however `next dev` and `next start` read their
 * environment.
 *
 * decisions/568-e2e-against-a-production-build.md
 */
export function serverCommand(target: E2eTarget, port: string): string {
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
