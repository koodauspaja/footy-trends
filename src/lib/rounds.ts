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

type RoundCandidate = { status: string; matchday: number | null; kickoffAt: Date };
const FINISHED_STATUS = "FINISHED";

/**
 * The round to show by default: the earliest not-yet-finished match's
 * matchday, or the season's last round if everything is `FINISHED`. Callers
 * must supply a non-empty `matches` list and its season's `maxMatchday` —
 * an empty season has no "current round" and is the caller's own concern.
 */
export function resolveCurrentRound(matches: RoundCandidate[], maxMatchday: number): number {
  const nextUnplayed = matches
    .filter((match) => match.matchday !== null && match.status !== FINISHED_STATUS)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime())[0];
  return nextUnplayed?.matchday ?? maxMatchday;
}
