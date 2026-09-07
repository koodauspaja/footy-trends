/**
 * Regions and stored preferences, with **no database and no competition
 * registry** — the half of this that a client component may import.
 *
 * Both exclusions are load-bearing. `@/db` pulls in the Postgres driver, and
 * `domestic-competitions.ts` reaches `taso.ts` → `cache.ts` → `redis.ts` and so
 * pulls in ioredis; either one in a browser bundle fails the build on `dns`,
 * `net` and `tls`. Database access lives in `preferences.ts` and
 * registry-aware helpers in `competition-preferences.ts`, and neither is
 * reachable from the header, the front page or the settings form.
 *
 * See specs/024-account-settings.md.
 */

/**
 * The three regions as the reader meets them: Finnish URL segments, which is
 * also how `default_region` is stored, so the redirect is a lookup rather than
 * a translation.
 */
export const REGION_SEGMENTS = ["kotimaa", "ulkomaat", "maajoukkueet"] as const;

export type RegionSegment = (typeof REGION_SEGMENTS)[number];

export type Preferences = {
  defaultRegion: RegionSegment | null;
  defaultCompetitionDomestic: string | null;
  defaultCompetitionForeign: string | null;
  defaultCompetitionNational: string | null;
};

export const NO_PREFERENCES: Preferences = {
  defaultRegion: null,
  defaultCompetitionDomestic: null,
  defaultCompetitionForeign: null,
  defaultCompetitionNational: null,
};

export function isRegionSegment(value: unknown): value is RegionSegment {
  return REGION_SEGMENTS.includes(value as RegionSegment);
}

/**
 * A stored region, or null if it is not one of the three.
 *
 * Validated on read rather than trusted on write: the column is plain text, and
 * a value that no longer means anything must leave the reader on the picker
 * rather than redirect them somewhere that does not exist.
 */
export function resolveRegion(stored: string | null): RegionSegment | null {
  return isRegionSegment(stored) ? stored : null;
}

/** Maps a database row onto `Preferences`, validating the region on the way. */
export function toPreferences(row: {
  defaultRegion: string | null;
  defaultCompetitionDomestic: string | null;
  defaultCompetitionForeign: string | null;
  defaultCompetitionNational: string | null;
}): Preferences {
  return {
    defaultRegion: resolveRegion(row.defaultRegion),
    defaultCompetitionDomestic: row.defaultCompetitionDomestic,
    defaultCompetitionForeign: row.defaultCompetitionForeign,
    defaultCompetitionNational: row.defaultCompetitionNational,
  };
}
