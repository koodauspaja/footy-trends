/**
 * Regions and stored preferences, with no database and no competition
 * registry: the half a client component may import.
 *
 * decisions/024-account-settings.md
 */

/**
 * The three regions as the reader meets them: Finnish URL segments, which is
 * also how `default_region` is stored, so the redirect is a lookup rather than
 * a translation.
 *
 * decisions/024-account-settings.md
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
 * A stored region, or null if it is not one of the three. Validated on read,
 * not trusted on write.
 *
 * decisions/024-account-settings.md
 */
export function resolveRegion(stored: string | null): RegionSegment | null {
  return isRegionSegment(stored) ? stored : null;
}

/**
 * Maps a database row onto `Preferences`, validating the region on the way.
 *
 * decisions/024-account-settings.md
 */
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
