import { parseWholeNumber } from "../providers/provider-ids";
/**
 * The earliest selectable season. A season's id is its start year (2025 for
 * 2025/26), which is what football-data.org's `season` parameter expects.
 *
 * decisions/002-season-selector-and-backfill.md
 */
export const DEFAULT_EARLIEST_SEASON = 2023;

export type SeasonOption = {
  seasonId: number;
  label: string;
  /** Announced, with no match stored: shown in the selector, never chosen. */
  noMatches?: true;
};

/**
 * The options with one season marked as having no matches, or as they are when
 * there is none to mark.
 *
 * decisions/878-empty-season-not-selectable.md
 */
export function withNoMatches(options: SeasonOption[], seasonId: number | null): SeasonOption[] {
  if (seasonId === null) return options;
  return options.map((option) =>
    option.seasonId === seasonId ? { ...option, noMatches: true } : option
  );
}

/**
 * Whether `kausi` names a season the selector lets a reader choose.
 *
 * decisions/878-empty-season-not-selectable.md
 */
export function isChoosable(selectable: SeasonOption[], seasonId: number): boolean {
  return selectable.some((option) => option.seasonId === seasonId && option.noMatches !== true);
}

export type SeasonParamResult =
  | { kind: "absent" }
  | { kind: "valid"; seasonId: number }
  | { kind: "invalid" };

/**
 * Formats a season start year as `2024/25`, zero-padding a century rollover,
 * or as plain `2026` for a competition whose season does not span two calendar
 * years.
 *
 * decisions/002-season-selector-and-backfill.md
 * decisions/016-world-cup-and-euro.md
 */
export function formatSeasonLabel(seasonId: number, spansCalendarYears = true): string {
  if (!spansCalendarYears) return String(seasonId);
  const nextYear = String((seasonId + 1) % 100).padStart(2, "0");
  return `${seasonId}/${nextYear}`;
}

/**
 * Reads the configured floor, falling back to the default for any unusable value.
 *
 * decisions/002-season-selector-and-backfill.md
 */
export function resolveEarliestSeason(rawValue: string | undefined): number {
  // An environment variable, not a URL, but the same rule fits: a year is a
  // whole number our columns hold, and anything else is no floor at all.
  const parsed = parseWholeNumber(rawValue);
  return parsed !== null && parsed > 0 ? parsed : DEFAULT_EARLIEST_SEASON;
}

/**
 * Every season from the active season down to the floor, newest first. When
 * the provider has already published an upcoming season's fixtures (even
 * before it starts), `upcomingSeasonId` prepends it ahead of the active one.
 *
 * decisions/002-season-selector-and-backfill.md
 * decisions/005-listing-matches-for-selected-season.md
 */
export function listSelectableSeasons(
  activeSeasonId: number,
  earliestSeason: number,
  upcomingSeasonId?: number,
  spansCalendarYears = true
): SeasonOption[] {
  const oldest = Math.min(earliestSeason, activeSeasonId);
  const options: SeasonOption[] = [];
  if (upcomingSeasonId !== undefined && upcomingSeasonId > activeSeasonId) {
    options.push({
      seasonId: upcomingSeasonId,
      label: formatSeasonLabel(upcomingSeasonId, spansCalendarYears),
    });
  }
  for (let seasonId = activeSeasonId; seasonId >= oldest; seasonId -= 1) {
    options.push({ seasonId, label: formatSeasonLabel(seasonId, spansCalendarYears) });
  }
  return options;
}

/**
 * Validates the `kausi` query parameter against the selectable seasons. An
 * unvalidated value must never reach the provider URL, a cache key, or a query.
 *
 * decisions/002-season-selector-and-backfill.md
 * decisions/878-empty-season-not-selectable.md
 */
export function parseSeasonParam(
  rawValue: string | string[] | undefined,
  selectable: SeasonOption[]
): SeasonParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  const seasonId = parseWholeNumber(rawValue);
  if (seasonId === null) return { kind: "invalid" };

  return isChoosable(selectable, seasonId) ? { kind: "valid", seasonId } : { kind: "invalid" };
}
