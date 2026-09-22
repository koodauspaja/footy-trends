/**
 * A club's longest runs across every stored season — the data behind the team
 * page's `Ennätykset` panel (specs/039).
 *
 * **Pure.** The services decide which seasons count and pass their matches in,
 * exactly as they do for `Putket` and for the comparison panel.
 *
 * The rule that shapes everything here: **a run may cross a season boundary,
 * but only between consecutive seasons of the same competition** (S1). Stated
 * that way rather than as "the same competition", it rejects three things with
 * one test — a relegation, a promotion, and a season the app never fetched,
 * whose absence would otherwise let the seasons either side of it look adjacent
 * (S2).
 */
import { type ResultMatch, teamMatchesInOrder } from "./form-series";
import { leagueSeasons, type SeasonKey, type SeasonReadResult } from "./season-comparison";
import { type StreakKind, streaksOf } from "./streaks";

/** One stored league season's finished matches, and how the page names it. */
export type RecordSeason = {
  competitionCode: string;
  seasonId: number;
  /** The season as the page's own selector labels it, per provider. */
  label: string;
  finished: readonly ResultMatch[];
};

/**
 * A record, and the seasons it spans.
 *
 * Named by season rather than by match number (S3): match 37 of a run spanning
 * three seasons is not something a reader can find. `from` and `to` are equal
 * when a record sits inside one season.
 */
export type StreakRecord = { length: number; from: string; to: string };

export type StreakRecords = Record<StreakKind, StreakRecord | null>;

export type StreakRecordsSeries =
  | ({ status: "ok" } & { records: StreakRecords; seasons: number })
  /** No league season at all for this club, so no panel. */
  | { status: "unavailable" }
  | { status: "error" };

/** A match tagged with the season it was played in, so a record can name it. */
type PlacedMatch = ResultMatch & { label: string };

/**
 * The seasons split into runs that a streak may cross, oldest block last.
 *
 * Two seasons join only when they are the same competition and consecutive
 * years. A club promoted mid-history therefore keeps one block per spell in
 * each division, which is what a supporter means by "our best run in
 * Veikkausliiga".
 *
 * Blocks come back ordered by their newest season, so a caller walking them in
 * order sees the most recent last — which is how S7's tie-break is decided.
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
    const joins =
      current !== undefined &&
      current.last.competitionCode === season.competitionCode &&
      current.last.seasonId + 1 === season.seasonId;

    if (joins) {
      current.seasons.push(season);
      current.last = season;
    } else {
      blocks.push({ last: season, seasons: [season] });
    }
  }

  return blocks
    .sort((left, right) => left.last.seasonId - right.last.seasonId)
    .map((block) => block.seasons);
}

/**
 * The season a match of a run was played in.
 *
 * **Throws for an index outside the run's own sequence**, rather than returning
 * a label that would print as `Kausi ` and read as a season. `streaksOf` numbers
 * its runs over exactly the array passed here, so the state is unreachable in
 * production; the services catch the throw and report an error rather than a
 * record that names no season.
 */
export function labelAt(placed: readonly { label: string }[], position: number): string {
  const match = placed[position - 1];
  if (match === undefined) {
    throw new Error(`No match at position ${position} of ${placed.length}`);
  }
  return match.label;
}

/**
 * The club's records over every season it has stored.
 *
 * Each block's matches are counted as one sequence, so a run that ends a season
 * and continues into the next is one run. A longer record always wins; an equal
 * one is taken from the **most recent** block (S7), which is the record a reader
 * remembers and the only one that can still be extended.
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

/** Whether the club has any record at all — a club with no finished match has none. */
export function hasAnyRecord(records: StreakRecords): boolean {
  return Object.values(records).some((record) => record !== null);
}

/**
 * The whole panel for one club, from a reader the caller supplies.
 *
 * **One orchestrator, both providers**, as specs/038's `comparisonFor` is: they
 * differ in how a season is found and in what counts as a league, and in
 * nothing else. `label` comes from the page rather than from here, because how
 * a season is written differs by provider — plain years domestically,
 * `2024/25` abroad — and it must be the wording the page's own season selector
 * already uses.
 *
 * Any failed read fails the panel (S9). A record is not an average, so a
 * missing season could only make one too small rather than wrong in kind — but
 * the comparison beside it fails for the same reason, and one rule across both
 * beats a defensible difference.
 */
export async function recordsFor<T extends SeasonKey>(
  teamId: number,
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean,
  label: (seasonId: number) => string,
  read: (key: SeasonKey) => Promise<SeasonReadResult>
): Promise<StreakRecordsSeries> {
  const results: Array<{ season: T; result: SeasonReadResult }> = await Promise.all(
    leagueSeasons(seasons, isLeague).map(async (season) => ({
      season,
      result: await read(season),
    }))
  );
  if (results.some(({ result }) => result.status === "error")) return { status: "error" };

  const stored: RecordSeason[] = results.flatMap(({ season, result }) =>
    result.status === "ok"
      ? [
          {
            competitionCode: season.competitionCode,
            seasonId: season.seasonId,
            label: label(season.seasonId),
            finished: result.read.finished,
          },
        ]
      : []
  );
  if (stored.length === 0) return { status: "unavailable" };

  return { status: "ok", records: streakRecords(stored, teamId), seasons: stored.length };
}
