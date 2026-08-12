/**
 * A round is a matchday. Which rounds are selectable depends on the season
 * (how many matchdays have at least one stored match), so — unlike seasons —
 * there is no independent floor/ceiling to configure; the caller supplies
 * the season's highest known matchday.
 */

export type RoundParamResult =
  | { kind: "absent" }
  | { kind: "valid"; round: number }
  | { kind: "invalid" };

const POSITIVE_INTEGER = /^\d+$/;

/** Every round from 1 to the season's highest known matchday. */
export function listSelectableRounds(maxMatchday: number | null): number[] {
  if (maxMatchday === null || maxMatchday < 1) return [];
  return Array.from({ length: maxMatchday }, (_, index) => index + 1);
}

/**
 * Validates the `kierros` query parameter against the season's highest known
 * matchday. An unvalidated value must never reach a cache key or a query.
 */
export function parseRoundParam(
  rawValue: string | string[] | undefined,
  maxMatchday: number | null
): RoundParamResult {
  if (rawValue === undefined || rawValue === "") return { kind: "absent" };
  if (typeof rawValue !== "string" || !POSITIVE_INTEGER.test(rawValue)) return { kind: "invalid" };

  const round = Number(rawValue);
  if (maxMatchday === null || round < 1 || round > maxMatchday) return { kind: "invalid" };
  return { kind: "valid", round };
}
