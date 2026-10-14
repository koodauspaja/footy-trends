/**
 * A club's longest runs across every stored season. Pure: the services pass the
 * seasons in. A run may cross a season boundary only between consecutive
 * seasons of the same competition.
 *
 * decisions/039-streak-records.md
 * decisions/040-cup-analytics.md
 * decisions/041-national-team-analytics.md
 */
import { type ResultMatch, teamMatchesInOrder } from "./form-series";
import { leagueSeasons, type SeasonKey, type SeasonReadResult } from "./season-comparison";
import { type StreakKind, streaksOf } from "./streaks";

/**
 * One stored league season's finished matches, and how the page names it.
 *
 * decisions/039-streak-records.md
 */
export type RecordSeason = {
  competitionCode: string;
  seasonId: number;
  /** The season as the page's own selector labels it, per provider. */
  label: string;
  finished: readonly ResultMatch[];
};

/**
 * A record, and the seasons it spans. `from` and `to` are equal when it sits
 * inside one season.
 *
 * decisions/039-streak-records.md
 */
export type StreakRecord = { length: number; from: string; to: string };

export type StreakRecords = Record<StreakKind, StreakRecord | null>;

export type StreakRecordsSeries =
  | ({ status: "ok" } & {
      records: StreakRecords;
      /**
       * What the records cover, as the panel prints it: one line, built by the
       * caller.
       */
      scope: string;
    })
  /** No league season at all for this club, so no panel. */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * One period the records were read from, for the line that says what they cover.
 *
 * decisions/041-national-team-analytics.md
 */
export type Covered = { competition: string; seasonId: number };

/**
 * A match tagged with the season it was played in, so a record can name it.
 *
 * decisions/039-streak-records.md
 */
type PlacedMatch = ResultMatch & { label: string };

/**
 * The seasons split into runs a streak may cross: same competition,
 * consecutive years. Ordered by each block's newest season, most recent last.
 *
 * decisions/039-streak-records.md
 */
export function seasonBlocks(seasons: readonly RecordSeason[]): RecordSeason[][] {
  const ordered = [...seasons].sort(
    (left, right) =>
      left.competitionCode.localeCompare(right.competitionCode) || left.seasonId - right.seasonId
  );

  // `last` is carried rather than read back off the block, so a block is never
  // indexed and there is no "empty block" case to defend against.
  const blocks: Array<{ last: RecordSeason; seasons: RecordSeason[] }> = [];
  for (const season of ordered) {
    const current = blocks.at(-1);
    // Compared rather than added to, so an absent block simply fails both
    // tests instead of needing its own.
    const joins =
      current?.last.competitionCode === season.competitionCode &&
      current?.last.seasonId === season.seasonId - 1;

    if (joins) {
      current.seasons.push(season);
      current.last = season;
    } else {
      blocks.push({ last: season, seasons: [season] });
    }
  }

  return blocks
    .toSorted((left, right) => left.last.seasonId - right.last.seasonId)
    .map((block) => block.seasons);
}

/**
 * The season a match of a run was played in. Throws for an index outside the
 * run's own sequence.
 *
 * decisions/039-streak-records.md
 */
export function labelAt(placed: readonly { label: string }[], position: number): string {
  const match = placed[position - 1];
  if (match === undefined) {
    throw new Error(`No match at position ${position} of ${placed.length}`);
  }
  return match.label;
}

/**
 * The club's records over every season it has stored. A longer record wins; an
 * equal one is taken from the most recent block.
 *
 * decisions/039-streak-records.md
 */
export function streakRecords(seasons: readonly RecordSeason[], teamId: number): StreakRecords {
  const records: StreakRecords = { wins: null, unbeaten: null, defeats: null, winless: null };

  for (const block of seasonBlocks(seasons)) {
    const matches: PlacedMatch[] = block.flatMap((season) =>
      season.finished.map((match) => ({ ...match, label: season.label }))
    );
    // The same ordering `streaksOf` applies internally, so a streak's match
    // numbers index this array exactly.
    const placed = teamMatchesInOrder(matches, teamId);
    const { longest } = streaksOf(matches, teamId);

    for (const kind of Object.keys(records) as StreakKind[]) {
      const streak = longest[kind];
      if (streak === null) continue;

      const best = records[kind];
      // `>=` rather than `>`: blocks arrive oldest first, so an equal record
      // from a later block replaces the earlier one.
      if (best === null || streak.length >= best.length) {
        records[kind] = {
          length: streak.length,
          from: labelAt(placed, streak.from),
          to: labelAt(placed, streak.to),
        };
      }
    }
  }

  return records;
}

/**
 * Whether the club has any record at all: a club with no finished match has none.
 *
 * decisions/039-streak-records.md
 */
export function hasAnyRecord(records: StreakRecords): boolean {
  return Object.values(records).some((record) => record !== null);
}

/**
 * The whole panel for one club, from a reader the caller supplies: one
 * orchestrator for both providers. Any failed read fails the panel.
 *
 * decisions/039-streak-records.md
 */
export async function recordsFor<T extends SeasonKey>(
  teamId: number,
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean,
  label: (seasonId: number) => string,
  read: (key: SeasonKey) => Promise<SeasonReadResult>,
  describe: (covered: readonly Covered[]) => string
): Promise<StreakRecordsSeries> {
  const results: Array<{ season: T; result: SeasonReadResult }> = await Promise.all(
    leagueSeasons(seasons, isLeague).map(async (season) => ({
      season,
      result: await read(season),
    }))
  );
  if (results.some(({ result }) => result.status === "error")) return { status: "error" };

  const loaded = results.flatMap(({ season, result }) =>
    result.status === "ok" ? [{ season, season_read: result.read }] : []
  );
  if (loaded.length === 0) return { status: "unavailable" };

  const stored: RecordSeason[] = loaded.map(({ season, season_read }) => ({
    competitionCode: season.competitionCode,
    seasonId: season.seasonId,
    label: label(season.seasonId),
    finished: season_read.finished,
  }));

  return {
    status: "ok",
    records: streakRecords(stored, teamId),
    scope: describe(
      loaded.map(({ season, season_read }) => ({
        competition: season_read.competition,
        seasonId: season.seasonId,
      }))
    ),
  };
}

/**
 * What a club page's records cover: the competitions, each named once, in the
 * order met.
 *
 * decisions/040-cup-analytics.md
 * decisions/041-national-team-analytics.md
 */
export function competitionScope(covered: readonly Covered[]): string {
  return [...new Set(covered.map(({ competition }) => competition))].join(", ");
}
