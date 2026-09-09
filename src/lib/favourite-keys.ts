import { isRegionSegment, type RegionSegment } from "@/lib/regions";

/**
 * What a favourite *is*, with **no database and no session** — the half a client
 * component may import, from specs/026-favourites.md.
 *
 * The exclusion is the same one at the top of `regions.ts` and
 * `avatar-limits.ts`, and it is load-bearing here for a specific reason: the
 * toggle renders on the region picker, which lives on the four pages
 * `tests/unit/app/rendering-mode.test.ts` keeps prerendered (#182). Anything it
 * imports is in the browser bundle.
 */

/**
 * How many of each kind one reader may keep.
 *
 * Fifty is a judgement, not a measurement: enough that nobody sensible meets it,
 * small enough to bound both the `/suosikit` query and the session payload the
 * list rides on. It is one constant so that measuring can change it — see the
 * spec's note on decisions kept cheap to reverse.
 */
export const MAX_FAVOURITES_PER_KIND = 50;

/** The two providers, whose team id spaces are independent of each other. */
export const FAVOURITE_SOURCES = ["football-data", "taso"] as const;

export type FavouriteSource = (typeof FAVOURITE_SOURCES)[number];

export function isFavouriteSource(value: unknown): value is FavouriteSource {
  return FAVOURITE_SOURCES.includes(value as FavouriteSource);
}

/**
 * The largest value the `team_provider_id` column can hold: Postgres `integer`.
 *
 * `Number.isSafeInteger` is the wrong bound here and was used twice before this
 * constant existed — it accepts 9 007 199 254 740 991, which the column cannot
 * store, so the row would fail at the driver and surface as "something went
 * wrong" instead of "that is not an id".
 */
const MAX_TEAM_PROVIDER_ID = 2_147_483_647;

/**
 * Whether a number is an id the app could store, in the one place that decides.
 *
 * Shared rather than repeated: `parseTeamKey` reads ids out of the session and
 * the server actions read them off the wire, and two copies of this rule are
 * exactly how they drift — see `taso.ts`'s `parseProviderId`, which enforces the
 * same bound for the same reason.
 */
export function isTeamProviderId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_TEAM_PROVIDER_ID
  );
}

/**
 * A favourite as one string, because the only thing anything does with it is
 * compare it.
 *
 * `"taso:60731"` is one `includes` against a list; a `{ source, id }` object
 * would be a `find` with two fields at every call site, and the session payload
 * would carry the key names on every entry.
 */
export function teamKey(source: FavouriteSource, teamProviderId: number): string {
  return `${source}:${teamProviderId}`;
}

export function competitionKey(region: RegionSegment, code: string): string {
  return `${region}:${code}`;
}

/**
 * A team key read back into its parts, or null when it is not one.
 *
 * Validated rather than trusted: these arrive from a session payload the client
 * cannot vouch for, and a malformed key must render nothing rather than a link
 * to a team that does not exist.
 */
export function parseTeamKey(
  key: string
): { source: FavouriteSource; teamProviderId: number } | null {
  const separator = key.indexOf(":");
  if (separator === -1) return null;

  const source = key.slice(0, separator);
  if (!isFavouriteSource(source)) return null;

  // The same rule `parseProviderId` applies in taso.ts: a positive decimal
  // integer, or it is not an id. `Number("")` is 0 and `Number("0x10")` is 16,
  // and neither is a team.
  const rest = key.slice(separator + 1);
  if (!/^\d+$/.test(rest)) return null;
  const teamProviderId = Number(rest);
  return isTeamProviderId(teamProviderId) ? { source, teamProviderId } : null;
}

/** A competition key read back into its parts, or null when the region is not one of the three. */
export function parseCompetitionKey(key: string): { region: RegionSegment; code: string } | null {
  const separator = key.indexOf(":");
  if (separator === -1) return null;

  const region = key.slice(0, separator);
  const code = key.slice(separator + 1);
  // The code is checked against the registry on read, not here — a competition
  // can be retired long after someone favourited it, and that is `/suosikit`'s
  // problem to report rather than this function's to hide.
  return isRegionSegment(region) && code !== "" ? { region, code } : null;
}
