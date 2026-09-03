/**
 * Which stored table a match route resolves against, and under what predicate.
 *
 * There is no single match id space: `matches` and `taso_matches` are separate
 * tables with independent provider ids, and 317 numeric ids exist in both
 * (measured 2026-09-02). A route therefore has to name its source before an id
 * means anything. See specs/019-match-page.md.
 */

import type { CompetitionRegion } from "./competitions";

/**
 * `bucket` splits `taso_matches` between the Finnish club game and the two
 * national teams, which share the table.
 *
 * `domestic` is the **negation** of `national`, not a `spljp%` test. Almost
 * every Finnish competition lives inside the `spljp{YY}` season umbrella, but
 * Ykkösliigacup publishes its own `M1LCUP{YY}` — a `spljp%` predicate would
 * make every one of its 69 stored matches a not-found. The two predicates are
 * exhaustive over the table and cannot both match, which is the property the
 * routes need.
 */
export type MatchSource =
  | { kind: "football-data"; region: CompetitionRegion }
  | { kind: "taso"; bucket: "domestic" | "national" };

/** The `competition_id` prefix TASO uses for national-team seasons. */
export const NATIONAL_TEAM_COMPETITION_PREFIX = "maajp";
