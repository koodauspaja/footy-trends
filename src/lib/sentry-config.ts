/**
 * Reading Sentry's settings from the environment, safely.
 *
 * Shared by all three configs — server, edge and client — so a change is made
 * once rather than three times, and so the parsing has somewhere to be tested.
 * The Sentry config files themselves call `Sentry.init` at import, which makes
 * them poor homes for logic worth asserting on.
 */

/** The default when a variable is unset, blank, or unusable. */
export const DEFAULT_TRACES_SAMPLE_RATE = 1;

/**
 * A sample rate from a variable, falling back rather than trusting `Number`.
 *
 * `Number("")` is `0`, so an empty variable — one copied from `.env.example`,
 * or added in a dashboard without a value — would silently switch tracing off
 * entirely while looking configured. `Number("high")` is `NaN`, which Sentry
 * would take as a rate of nothing at all.
 *
 * A rate outside 0–1 is meaningless, so it is rejected too rather than passed
 * through for the SDK to interpret.
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
 * A boolean from a variable, defaulting to on.
 *
 * Only `false` turns a flag off — case-insensitively, and ignoring surrounding
 * whitespace, since `FALSE` and `" false "` are plainly the same intent and a
 * dashboard is an easy place to acquire a stray space. Anything else — unset,
 * blank, a typo — leaves the flag as it was, because the failure that matters
 * here is a setting silently flipping, not one failing to flip.
 */
export function flagFrom(raw: string | undefined, fallback = true): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed === undefined || trimmed === "") return fallback;
  return trimmed !== "false";
}
