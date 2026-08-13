/**
 * Season identifiers are the season's start year (e.g. 2025 for 2025/26), which
 * is what the football-data.org `season` query parameter expects.
 *
 * The provider's `seasons[]` array advertises every season back to 1888, but
 * only the seasons inside the current API plan return 200 — the rest return
 * 403. The selectable range is therefore bounded by configuration rather than
 * by the provider's list. See specs/002-season-selector-and-backfill.md.
 */
export const DEFAULT_EARLIEST_SEASON = 2023;

export type SeasonOption = {
  seasonId: number;
  label: string;
};

export type SeasonParamResult =
  | { kind: "absent" }
  | { kind: "valid"; seasonId: number }
  | { kind: "invalid" };

const POSITIVE_INTEGER = /^\d+$/;

/** Formats a season start year as `2024/25`, zero-padding a century rollover. */
export function formatSeasonLabel(seasonId: number): string {
  const nextYear = String((seasonId + 1) % 100).padStart(2, "0");
  return `${seasonId}/${nextYear}`;
}

/** Reads the configured floor, falling back to the default for any unusable value. */
export function resolveEarliestSeason(rawValue: string | undefined): number {
  if (rawValue === undefined || !POSITIVE_INTEGER.test(rawValue)) return DEFAULT_EARLIEST_SEASON;
  const parsed = Number(rawValue);
  return parsed > 0 ? parsed : DEFAULT_EARLIEST_SEASON;
}

/**
 * Every season from the active season down to the floor, newest first. When
 * the provider has already published an upcoming season's fixtures (even
 * before it starts), `upcomingSeasonId` prepends it ahead of the active one.
 */
export function listSelectableSeasons(
  activeSeasonId: number,
  earliestSeason: number,
  upcomingSeasonId?: number
): SeasonOption[] {
  const oldest = Math.min(earliestSeason, activeSeasonId);
  const options: SeasonOption[] = [];
  if (upcomingSeasonId !== undefined && upcomingSeasonId > activeSeasonId) {
    options.push({ seasonId: upcomingSeasonId, label: formatSeasonLabel(upcomingSeasonId) });
  }
  for (let seasonId = activeSeasonId; seasonId >= oldest; seasonId -= 1) {
    options.push({ seasonId, label: formatSeasonLabel(seasonId) });
  }
  return options;
}

/**
 * Validates the `kausi` query parameter against the selectable seasons. An
 * unvalidated value must never reach the provider URL, a cache key, or a query.
 */
export function parseSeasonParam(
  rawValue: string | string[] | undefined,
  selectable: SeasonOption[]
): SeasonParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string" || !POSITIVE_INTEGER.test(rawValue)) return { kind: "invalid" };

  const seasonId = Number(rawValue);
  return selectable.some((option) => option.seasonId === seasonId)
    ? { kind: "valid", seasonId }
    : { kind: "invalid" };
}
