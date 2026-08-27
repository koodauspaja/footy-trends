/**
 * The Huuhkajat page's data rules — see specs/017-huuhkajat.md.
 *
 * Pure functions only: the mapping, the category rule, the label rule and the
 * Finland filter. Fetching lives in `huuhkajat-service.ts`, so every rule here
 * is testable without a provider.
 */

/** The men's national team, as TASO names it. */
export const FINLAND_TEAM_NAME = "Suomi";

/** What every Huuhkajat category's name ends with, and nothing else's does. */
const CATEGORY_SUFFIX = " Huuhkajat";

/**
 * Year → TASO `competition_id`, newest first.
 *
 * A lookup rather than a formula, because 2021 breaks the pattern: it lives at
 * `maajp18`, whose categories report `season_id: 2021` and which carries the
 * Euro 2020 finals played that June. `seasonFromCompetitionId` reads an id's
 * last two characters and would call it 2018, so it must not be used here.
 *
 * New years are added by hand. `getCompetitions` lists only currently
 * published competitions and cannot enumerate history, so there is nothing to
 * discover from.
 */
const COMPETITION_IDS: ReadonlyArray<readonly [year: number, competitionId: string]> = [
  [2026, "maajp2026"],
  [2025, "maajp2025"],
  [2024, "maajp2024"],
  [2023, "maajp2023"],
  [2022, "maajp2022"],
  [2021, "maajp18"],
];

/** Every year the page covers with its id, newest first. */
export const HUUHKAJAT_SEASONS: ReadonlyArray<{ year: number; competitionId: string }> =
  COMPETITION_IDS.map(([year, competitionId]) => ({ year, competitionId }));

/** Every year the page covers, newest first. */
export const HUUHKAJAT_YEARS: readonly number[] = COMPETITION_IDS.map(([year]) => year);

/**
 * The newest year in the table, which drives the cache TTL split: it is
 * treated as still changing, every older year as immutable.
 */
export const HUUHKAJAT_ACTIVE_YEAR = Math.max(...HUUHKAJAT_YEARS);

export function competitionIdForYear(year: number): string | null {
  return COMPETITION_IDS.find(([candidate]) => candidate === year)?.[1] ?? null;
}

/** A men's A-team category, paired with the label its rows will show. */
export type HuuhkajatCategory = { categoryId: string; competitionName: string };

/**
 * The categories in one year that belong to the men's A team, each already
 * carrying the label its rows show.
 *
 * Discovered from the year's own categories rather than hardcoded: 2022–2024
 * carry `EC` and 2025–2026 do not. The suffix is also what keeps Helmarit and
 * the youth teams out — their names end ` Helmarit`, ` U21-miehet` and so on.
 *
 * Safe only because the floor is 2021. The 2015–2019 names (`Miesten
 * A-maaottelut`) carry no suffix at all, which is one reason that era is out
 * of scope.
 *
 * The label is resolved here, with the name in hand, rather than looked up
 * again later — a second lookup would need a fallback for a key that came out
 * of this very map, which cannot be missing.
 */
export function huuhkajatCategories(categoryNames: Record<string, string>): HuuhkajatCategory[] {
  return Object.entries(categoryNames)
    .filter(([, name]) => name.endsWith(CATEGORY_SUFFIX))
    .map(([categoryId, name]) => ({ categoryId, competitionName: competitionLabel(name) }));
}

/**
 * What a row says its competition was: the category's own name with the
 * trailing ` Huuhkajat` removed.
 *
 * Not normalised. TASO calls the friendlies `Muut A-maaottelut` in 2021 and
 * `A-maaottelut` from 2022, and both are shown as it spells them — the
 * alternative is the hardcoded id→name table the suffix rule exists to avoid.
 */
export function competitionLabel(categoryName: string): string {
  return categoryName.endsWith(CATEGORY_SUFFIX)
    ? categoryName.slice(0, -CATEGORY_SUFFIX.length)
    : categoryName;
}

/**
 * Whether Finland actually played in this match.
 *
 * A category is not only Finland's matches: 2023's `ECQ` returns all 30
 * matches of the Euro 2024 qualifying group, of which 10 are Finland's.
 * Without this the page would list `Kazakstan - Slovenia` under a heading
 * reading `Huuhkajat`.
 *
 * Matched on the name because there is no team id that is stable across
 * categories, and TASO publishes the name in Finnish already.
 */
export function isFinlandMatch(match: { homeTeamName: string; awayTeamName: string }): boolean {
  return match.homeTeamName === FINLAND_TEAM_NAME || match.awayTeamName === FINLAND_TEAM_NAME;
}

/**
 * Chronological within a year, `match_id` breaking a tie so the order does not
 * shift between renders of the same data.
 */
export function byKickoffThenId<T extends { kickoffAt: Date; providerMatchId: number }>(
  left: T,
  right: T
): number {
  const byKickoff = left.kickoffAt.getTime() - right.kickoffAt.getTime();
  return byKickoff === 0 ? left.providerMatchId - right.providerMatchId : byKickoff;
}

/** `1 ottelu`, `10 ottelua` — the count in a year's summary line. */
export function matchCountLabel(count: number): string {
  return count === 1 ? "1 ottelu" : `${count} ottelua`;
}
