/**
 * The data rules shared by both national-team pages, as pure functions. Each is
 * parameterised by a `NationalTeam`: Huuhkajat and Helmarit read the same
 * provider buckets and differ in which categories they select.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 * decisions/019-match-page.md
 * decisions/041-national-team-analytics.md
 */

/**
 * Finland, as TASO names it, identically for both teams.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export const FINLAND_TEAM_NAME = "Suomi";

/**
 * What distinguishes one team's categories from the other's inside a bucket.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 * decisions/019-match-page.md
 */
export type NationalTeam = {
  /** The suffix every one of this team's category names ends with. */
  categorySuffix: string;
  /** Shown as the page heading and in the picker. */
  displayName: string;
  /**
   * The team's own public path, which its match rows link under.
   */
  basePath: string;
};

export const MENS_TEAM: NationalTeam = {
  categorySuffix: " Huuhkajat",
  displayName: "Huuhkajat",
  basePath: "/maajoukkueet/huuhkajat",
};

export const WOMENS_TEAM: NationalTeam = {
  categorySuffix: " Helmarit",
  displayName: "Helmarit",
  basePath: "/maajoukkueet/helmarit",
};

/**
 * Year to TASO `competition_id`, newest first. A lookup, not a formula: 2021
 * lives at `maajp18`. `year` only picks a cache TTL.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
const COMPETITION_IDS: ReadonlyArray<readonly [year: number, competitionId: string]> = [
  [2026, "maajp2026"],
  [2025, "maajp2025"],
  [2024, "maajp2024"],
  [2023, "maajp2023"],
  [2022, "maajp2022"],
  [2021, "maajp18"],
];

/**
 * The oldest calendar year any national-team bucket carries matches for: the
 * matches a bucket holds, not the id it is filed under.
 *
 * decisions/019-match-page.md
 */
export const EARLIEST_NATIONAL_TEAM_YEAR = 2018;

export const NATIONAL_TEAM_SEASONS: ReadonlyArray<{ year: number; competitionId: string }> =
  COMPETITION_IDS.map(([year, competitionId]) => ({ year, competitionId }));

/**
 * Every bucket year the pages read, newest first.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export const NATIONAL_TEAM_YEARS: readonly number[] = COMPETITION_IDS.map(([year]) => year);

/**
 * The newest bucket, which drives the cache TTL split: treated as still
 * changing, every older one as immutable.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export const NATIONAL_TEAM_ACTIVE_YEAR = Math.max(...NATIONAL_TEAM_YEARS);

export function competitionIdForYear(year: number): string | null {
  return COMPETITION_IDS.find(([candidate]) => candidate === year)?.[1] ?? null;
}

/**
 * A team's category, paired with the label its rows will show.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export type NationalTeamCategory = { categoryId: string; competitionName: string };

/**
 * The categories in one bucket belonging to this team, each already carrying
 * the label its rows show. Discovered, not hardcoded.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function nationalTeamCategories(
  team: NationalTeam,
  categoryNames: Record<string, string>
): NationalTeamCategory[] {
  return Object.entries(categoryNames)
    .filter(([, name]) => name.endsWith(team.categorySuffix))
    .map(([categoryId, name]) => ({
      categoryId,
      competitionName: competitionLabel(team, name),
    }));
}

/**
 * What a row says its competition was: the team suffix comes off, and TASO's
 * trailing campaign year and leading `Muut ` are normalised away.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function competitionLabel(team: NationalTeam, categoryName: string): string {
  const withoutTeam = categoryName.endsWith(team.categorySuffix)
    ? categoryName.slice(0, -team.categorySuffix.length)
    : categoryName;

  // Guarded so a label that is *only* a year, or only `Muut`, is left alone
  // rather than reduced to nothing.
  const withoutYear = withoutTeam.replace(/(?<=\S)\s+\d{4}$/, "");
  return withoutYear.replace(/^Muut\s+(?=\S)/, "");
}

/**
 * Whether Finland played in this match. Matched on the name: no team id is
 * stable across categories.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function isFinlandMatch(match: { homeTeamName: string; awayTeamName: string }): boolean {
  return match.homeTeamName === FINLAND_TEAM_NAME || match.awayTeamName === FINLAND_TEAM_NAME;
}

/**
 * The id every analytics function keys on for Finland. Negative, so it cannot
 * collide with a provider id; it never leaves the app.
 *
 * decisions/041-national-team-analytics.md
 */
export const FINLAND_TEAM_ID = -1;

/**
 * The same match with `FINLAND_TEAM_ID` on Finland's side, whichever side that
 * is. A match Finland is not in comes back unchanged.
 *
 * decisions/041-national-team-analytics.md
 */
export function normalizeFinlandId<
  T extends {
    homeTeamName: string;
    awayTeamName: string;
    homeTeamProviderId: number;
    awayTeamProviderId: number;
  },
>(match: T): T {
  if (match.homeTeamName === FINLAND_TEAM_NAME) {
    return { ...match, homeTeamProviderId: FINLAND_TEAM_ID };
  }
  if (match.awayTeamName === FINLAND_TEAM_NAME) {
    return { ...match, awayTeamProviderId: FINLAND_TEAM_ID };
  }
  return match;
}

/**
 * Chronological within a year, `match_id` breaking a tie so the order does not
 * shift between renders of the same data.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function byKickoffThenId<T extends { kickoffAt: Date; providerMatchId: number }>(
  left: T,
  right: T
): number {
  const byKickoff = left.kickoffAt.getTime() - right.kickoffAt.getTime();
  return byKickoff === 0 ? left.providerMatchId - right.providerMatchId : byKickoff;
}

/**
 * The calendar year a match was played in, in Finnish local time: the timezone
 * the date column renders in.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function playedYear(kickoffAt: Date): number {
  return Number(
    new Intl.DateTimeFormat("fi-FI", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
    }).format(kickoffAt)
  );
}

/**
 * Matches grouped by the year they were played, newest year first,
 * chronological within a year.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function groupByPlayedYear<T extends { kickoffAt: Date; providerMatchId: number }>(
  matches: readonly T[]
): { year: number; matches: T[] }[] {
  const byYear = new Map<number, T[]>();
  for (const match of matches) {
    const year = playedYear(match.kickoffAt);
    const bucket = byYear.get(year);
    if (bucket === undefined) byYear.set(year, [match]);
    else bucket.push(match);
  }

  // `toSorted` rather than `sort`: these arrays are the map's own values, and
  // sorting them in place inside a `.map()` reads as a pure transformation
  // while mutating what it walks over.
  return [...byYear.entries()]
    .toSorted(([left], [right]) => right - left)
    .map(([year, yearMatches]) => ({ year, matches: yearMatches.toSorted(byKickoffThenId) }));
}

/**
 * `1 ottelu`, `10 ottelua`: the count in a year's summary line.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export function matchCountLabel(count: number): string {
  return count === 1 ? "1 ottelu" : `${count} ottelua`;
}
