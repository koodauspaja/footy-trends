/**
 * Reading Sentry's settings from the environment, safely. Shared by all three
 * configs: server, edge and client.
 *
 * decisions/140-sentry-production-configuration.md
 */

/**
 * The default when a variable is unset, blank, or unusable: a tenth, so an
 * environment that sets nothing cannot trace every request.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/**
 * A sample rate from a variable. Unset, blank, not a number or outside 0–1
 * falls back to the default.
 *
 * decisions/140-sentry-production-configuration.md
 */
export function sampleRateFrom(
  raw: string | undefined,
  fallback = DEFAULT_TRACES_SAMPLE_RATE
): number {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === "") return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

/**
 * A boolean from a variable, defaulting to on. Only `false` turns a flag off,
 * case-insensitively and ignoring surrounding whitespace.
 *
 * decisions/140-sentry-production-configuration.md
 */
export function flagFrom(raw: string | undefined, fallback = true): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed === undefined || trimmed === "") return fallback;
  return trimmed !== "false";
}
