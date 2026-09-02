/**
 * The data rules shared by both national-team pages — see
 * specs/018-helmarit.md, and specs/017-huuhkajat.md for how they arose.
 *
 * Pure functions only: the bucket table, category discovery, the label rules,
 * the Finland filter and the year grouping. Fetching lives in
 * `national-team-service.ts`, so every rule here is testable without a
 * provider.
 *
 * Everything is parameterised by a `NationalTeam`, because Huuhkajat and
 * Helmarit read the *same* provider buckets and differ only in which
 * categories they select and what the page is called.
 */

/** Finland, as TASO names it — identically for both teams, verified. */
export const FINLAND_TEAM_NAME = "Suomi";

/** What distinguishes one team's categories from the other's inside a bucket. */
export type NationalTeam = {
  /** The suffix every one of this team's category names ends with. */
  categorySuffix: string;
  /** Shown as the page heading and in the picker. */
  displayName: string;
  /**
   * The team's own public path, which its match rows link under.
   *
   * These matches are TASO's while `/maajoukkueet/ottelu/:id` is
   * football-data's, so each team's rows need a route that names their source.
   * See specs/019-match-page.md.
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
 * Year → TASO `competition_id`, newest first. Shared: both teams live in the
 * same buckets.
 *
 * A lookup rather than a formula, because 2021 breaks the pattern — it lives
 * at `maajp18`, whose categories report `season_id: 2021`. Deriving a season
 * from an id is what stored rows under 2018 while every read asked for 2021
 * (#182's sibling bug in #166); `seasonFromCompetitionId` was deleted for it
 * and must not come back.
 *
 * `year` is the bucket's nominal season, used only to pick a cache TTL. It is
 * **not** the year a match is filed under — see `groupByPlayedYear`.
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
 * The oldest calendar year any national-team bucket carries matches for.
 *
 * Not a bucket's nominal year: `maajp18` reports `season_id: 2021` while
 * holding matches played in 2018, 2019, 2020 and 2021 — measured exhaustively
 * in specs/018-helmarit.md. This is the year the match page's head-to-head
 * states as the window it looked in, so it describes the *matches* a bucket
 * holds rather than the id it is filed under.
 */
export const EARLIEST_NATIONAL_TEAM_YEAR = 2018;

export const NATIONAL_TEAM_SEASONS: ReadonlyArray<{ year: number; competitionId: string }> =
  COMPETITION_IDS.map(([year, competitionId]) => ({ year, competitionId }));

/** Every bucket year the pages read, newest first. */
export const NATIONAL_TEAM_YEARS: readonly number[] = COMPETITION_IDS.map(([year]) => year);

/**
 * The newest bucket, which drives the cache TTL split: treated as still
 * changing, every older one as immutable.
 */
export const NATIONAL_TEAM_ACTIVE_YEAR = Math.max(...NATIONAL_TEAM_YEARS);

export function competitionIdForYear(year: number): string | null {
  return COMPETITION_IDS.find(([candidate]) => candidate === year)?.[1] ?? null;
}

/** A team's category, paired with the label its rows will show. */
export type NationalTeamCategory = { categoryId: string; competitionName: string };

/**
 * The categories in one bucket belonging to this team, each already carrying
 * the label its rows show.
 *
 * Discovered rather than hardcoded: the set moves between buckets. Huuhkajat
 * carries `EC` in 2022–2024 and not after; Helmarit gains `WUNL` only from
 * 2023, and `maajp18` holds three of its five. The suffix is also what keeps
 * the other team, the youth sides and futsal out.
 *
 * The label is resolved here, with the name in hand, rather than looked up
 * again later — a second lookup would need a fallback for a key that came out
 * of this very map, which cannot be missing.
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
 * What a row says its competition was.
 *
 * The team suffix comes off, and then two of TASO's own wording variants are
 * normalised so one competition reads the same way in every year:
 *
 * - a trailing four-digit campaign year — `MM-karsinnat 2023` in the buckets
 *   up to 2024, plain `MM-karsinnat` from 2025;
 * - a leading `Muut ` — `Muut A-maaottelut` in `maajp18`, `A-maaottelut` from
 *   2022.
 *
 * Rules rather than an id→name table, which would need an entry per bucket
 * because the provider's wording changes between them, and is the very thing
 * the suffix rule exists to avoid. Checked against all thirteen distinct
 * category names both teams produce: nothing else is touched.
 *
 * The `Muut` case is a rename, not two competitions — the category id is
 * identical either side of it (`Miehet-A`, `Naiset-A`) in every bucket.
 *
 * This supersedes #166's decision to show provider labels exactly as spelled,
 * which was taken when `Muut A-maaottelut` was the only example. See
 * specs/018-helmarit.md.
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
 * Whether Finland actually played in this match.
 *
 * A category is not only Finland's matches, and on the women's side two are
 * *entirely* other teams' — `maajp2024/Naiset-A` and `maajp2025/WEC`. Without
 * this the page would list matches Finland was not in.
 *
 * Matched on the name because there is no team id stable across categories,
 * and TASO publishes the name in Finnish already.
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

/**
 * The calendar year a match was played in, in Finnish local time — which is
 * the timezone the date column renders in, so a late kick-off cannot be filed
 * under one year and displayed under another.
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
 * Matches grouped by the year they were **played**, newest year first,
 * chronological within a year.
 *
 * A bucket is not a calendar year. `maajp18` holds three years of Huuhkajat
 * matches and **four** of Helmarit's, reaching back to 2018. Filing them under
 * the bucket's nominal season put a 2019 qualifier under a 2021 heading.
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

/** `1 ottelu`, `10 ottelua` — the count in a year's summary line. */
export function matchCountLabel(count: number): string {
  return count === 1 ? "1 ottelu" : `${count} ottelua`;
}
