import { isRegionSegment, type RegionSegment } from "@/lib/regions";
import { isStoredInteger, parseWholeNumber } from "./provider-ids";

/**
 * What a favourite is, with no database and no session: the half a client
 * component may import.
 *
 * decisions/026-favourites.md
 */

/**
 * How many of each kind one reader may keep.
 *
 * decisions/026-favourites.md
 */
export const MAX_FAVOURITES_PER_KIND = 50;

/**
 * The two providers, whose team id spaces are independent of each other.
 *
 * decisions/026-favourites.md
 */
export const FAVOURITE_SOURCES = ["football-data", "taso"] as const;

export type FavouriteSource = (typeof FAVOURITE_SOURCES)[number];

export function isFavouriteSource(value: unknown): value is FavouriteSource {
  return FAVOURITE_SOURCES.includes(value as FavouriteSource);
}

/**
 * Whether a number is an id the app could store, in the one place that decides.
 *
 * decisions/026-favourites.md
 */
export function isTeamProviderId(value: unknown): value is number {
  // `isStoredInteger`, not `Number.isSafeInteger`: the latter accepts
  // 9 007 199 254 740 991, which the column cannot store, so the row would fail
  // at the driver as "something went wrong" instead of "that is not an id".
  return typeof value === "number" && isStoredInteger(value) && value > 0;
}

/**
 * A favourite as one string, because the only thing anything does with it is
 * compare it.
 *
 * decisions/026-favourites.md
 */
export function teamKey(source: FavouriteSource, teamProviderId: number): string {
  return `${source}:${teamProviderId}`;
}

export function competitionKey(region: RegionSegment, code: string): string {
  return `${region}:${code}`;
}

/**
 * A team key read back into its parts, or null when it is not one. Validated,
 * not trusted: it arrives in a session payload.
 *
 * decisions/026-favourites.md
 */
export function parseTeamKey(
  key: string
): { source: FavouriteSource; teamProviderId: number } | null {
  const separator = key.indexOf(":");
  if (separator === -1) return null;

  const source = key.slice(0, separator);
  if (!isFavouriteSource(source)) return null;

  // A positive decimal integer, or it is not an id: `Number("")` is 0 and
  // `Number("0x10")` is 16, and neither is a team.
  const teamProviderId = parseWholeNumber(key.slice(separator + 1));
  return isTeamProviderId(teamProviderId) ? { source, teamProviderId } : null;
}

/**
 * A competition key read back into its parts, or null when the region is not
 * one of the three.
 *
 * decisions/026-favourites.md
 */
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
