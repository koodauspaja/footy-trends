import { parseWholeNumber } from "./provider-ids";
/**
 * A round is a matchday. Which rounds are selectable depends on the season, so
 * the caller supplies the season's highest known matchday.
 *
 * decisions/003-standings-after-selected-round.md
 */

export type RoundParamResult =
  | { kind: "absent" }
  | { kind: "valid"; round: number }
  | { kind: "invalid" };

/**
 * Every round from 1 to the season's highest known matchday.
 *
 * decisions/003-standings-after-selected-round.md
 */
export function listSelectableRounds(maxMatchday: number | null): number[] {
  if (maxMatchday === null || maxMatchday < 1) return [];
  return Array.from({ length: maxMatchday }, (_, index) => index + 1);
}

/**
 * Validates the `kierros` query parameter against the season's highest known
 * matchday. An unvalidated value must never reach a cache key or a query.
 *
 * decisions/003-standings-after-selected-round.md
 */
export function parseRoundParam(
  rawValue: string | string[] | undefined,
  maxMatchday: number | null
): RoundParamResult {
  if (rawValue === undefined || rawValue === "") return { kind: "absent" };
  const round = parseWholeNumber(rawValue);
  if (round === null || maxMatchday === null || round < 1 || round > maxMatchday) {
    return { kind: "invalid" };
  }
  return { kind: "valid", round };
}

type RoundCandidate = { status: string; matchday: number | null; kickoffAt: Date };
const FINISHED_STATUS = "FINISHED";

/**
 * The round to show by default: the earliest not-yet-finished match's
 * matchday, or `maxMatchday`, the season's last round, if everything is
 * `FINISHED`. `matches` must not be empty.
 *
 * decisions/005-listing-matches-for-selected-season.md
 */
export function resolveCurrentRound(matches: RoundCandidate[], maxMatchday: number): number {
  const nextUnplayed = matches
    .filter((match) => match.matchday !== null && match.status !== FINISHED_STATUS)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime())[0];
  return nextUnplayed?.matchday ?? maxMatchday;
}
