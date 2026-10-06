/**
 * Which stored table a match route resolves against, and under what predicate.
 * A route has to name its source before an id means anything.
 *
 * decisions/019-match-page.md
 */

import type { CompetitionRegion } from "./competitions";

/**
 * `bucket` splits `taso_matches` between the Finnish club game and the two
 * national teams, which share the table. `domestic` is the negation of
 * `national`, not a `spljp%` test.
 *
 * decisions/019-match-page.md
 */
export type MatchSource =
  | { kind: "football-data"; region: CompetitionRegion }
  | { kind: "taso"; bucket: "domestic" | "national" };

/**
 * The `competition_id` prefix TASO uses for national-team seasons.
 *
 * decisions/019-match-page.md
 */
export const NATIONAL_TEAM_COMPETITION_PREFIX = "maajp";
