/**
 * A club's most recent league season in up to three facts, each a headline over
 * a number another panel already shows. Pure: the services pass the seasons in.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */
import { cleanSheetSeries } from "./clean-sheets";
import type { ResultMatch } from "./form-series";
import { homeAwayStats, pointsPerMatch, type SideStats } from "./home-away";
import {
  comparisonShare,
  leagueSeasons,
  positionIn,
  readSeasons,
  type SeasonKey,
  type SeasonRead,
  type SeasonReadResult,
} from "./season-comparison";
import type { StreakRecords, StreakRecordsSeries } from "./streak-records";
import type { StreakKind } from "./streaks";
import type { Surprise } from "./surprise";

/**
 * How many earlier seasons a comparison needs, and so how many in a row a
 * record must beat.
 *
 * decisions/066-season-summary.md
 */
export const MIN_EARLIER_SEASONS = 3;
/**
 * The matches a season needs played before it has a block, and a side before
 * it has a fact.
 *
 * decisions/066-season-summary.md
 */
export const MIN_MATCHES = 5;
/**
 * The upset's ceiling, a whole percent: the figure as the sentence prints it.
 *
 * decisions/066-season-summary.md
 */
export const UPSET_BELOW_PERCENT = 25;
/**
 * The decimals points per match is compared and printed with: the two
 * `Koti- ja vierastilastot` prints.
 *
 * decisions/066-season-summary.md
 */
export const POINTS_DECIMALS = 2;
/**
 * How many sentences a block holds at most.
 *
 * decisions/066-season-summary.md
 */
export const MAX_FACTS = 3;

export type Direction = "best" | "worst";

/**
 * A home or away record: points per match as printed, and how many earlier
 * seasons, newest first, it beats in a row. `everySeason` when that is all of them.
 *
 * decisions/066-season-summary.md
 */
export type SideFact = {
  kind: "home" | "away";
  direction: Direction;
  pointsPerMatch: number;
  beaten: number;
  everySeason: boolean;
};

/**
 * The club's clean-sheet share over the season, home and away together, as
 * `Nollapelit` prints it, and how many earlier seasons, newest first, it beats
 * in a row: the same count a home or away record makes.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 */
export type CleanSheetFact = {
  kind: "cleanSheets";
  direction: Direction;
  share: number;
  beaten: number;
  everySeason: boolean;
};

/**
 * The club's place in its table, read as `Tämä kausi verrattuna` reads it, and
 * how many earlier seasons, newest first, it beats in a row. A smaller place is
 * better.
 *
 * decisions/066-season-summary.md
 * decisions/070-season-summary-position.md
 */
export type PositionFact = {
  kind: "position";
  direction: Direction;
  place: number;
  beaten: number;
  everySeason: boolean;
};

/**
 * A club record from `Ennätykset` whose run ends in the selected season.
 *
 * decisions/066-season-summary.md
 */
export type RunFact = { kind: "run"; run: StreakKind; length: number };

/**
 * The team's own win Elo thought least likely.
 *
 * decisions/066-season-summary.md
 */
export type UpsetFact = { kind: "upset"; match: Surprise };

export type SummaryFact = SideFact | CleanSheetFact | PositionFact | RunFact | UpsetFact;

export type SeasonSummarySeries =
  | {
      status: "ok";
      /** One to `MAX_FACTS`, in the order the block shows them. */
      facts: SummaryFact[];
      /** The season still being played, labelled `(kesken)` once. */
      inProgress: boolean;
      /** The season as the page's selector labels it. */
      seasonLabel: string;
    }
  /** No block: not the club's latest league season, too few matches, or no fact. */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Points per match as `Koti- ja vierastilastot` prints it, or `null` for a side
 * with no match. Two seasons the panel shows alike are equal.
 *
 * decisions/066-season-summary.md
 */
export function shownPointsPerMatch(side: SideStats): number | null {
  const value = pointsPerMatch(side);
  return value === null ? null : Number(value.toFixed(POINTS_DECIMALS));
}

/**
 * The home or away fact, if the selected season's side beats at least
 * `MIN_EARLIER_SEASONS` earlier seasons in a row, newest first. A season it
 * only equals as printed, or one with no match on that side, stops the count.
 *
 * decisions/066-season-summary.md
 */
export function sideFact(
  kind: SideFact["kind"],
  selected: SideStats,
  earlier: readonly SideStats[]
): SideFact | null {
  const value = shownPointsPerMatch(selected);
  if (value === null || selected.matches < MIN_MATCHES) return null;

  const record = recordAgainst(value, earlier.map(shownPointsPerMatch));
  return record === null ? null : { kind, pointsPerMatch: value, ...record };
}

/**
 * The clean-sheet share after the club's last match, as `Nollapelit` prints it
 * (`percentText` rounds the same way), or `null` when the club played none.
 *
 * decisions/069-season-summary-clean-sheets.md
 */
export function shownCleanSheetShare(
  finished: readonly ResultMatch[],
  teamId: number
): number | null {
  const last = cleanSheetSeries(finished, teamId).points.at(-1);
  return last === undefined ? null : Math.round(last.share);
}

/**
 * The clean-sheet fact, if the selected season's share beats at least
 * `MIN_EARLIER_SEASONS` earlier seasons in a row, newest first. A season it
 * equals stops the count; one the club played no match in is left out.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 */
export function cleanSheetFact(
  selected: number | null,
  earlier: readonly (number | null)[]
): CleanSheetFact | null {
  if (selected === null) return null;

  const compared = earlier.filter((share) => share !== null);
  const record = recordAgainst(selected, compared);
  return record === null ? null : { kind: "cleanSheets", share: selected, ...record };
}

/**
 * The position fact, if the selected place beats at least `MIN_EARLIER_SEASONS`
 * earlier places from `seasonPlaces` in a row, newest first. An equal place, or a
 * season that ranked the club nowhere, stops the count.
 *
 * decisions/070-season-summary-position.md
 */
export function positionFact(
  selected: number | null,
  earlier: readonly (number | null)[]
): PositionFact | null {
  if (selected === null) return null;

  const record = recordAgainst(selected, earlier, (place, other) => place < other);
  return record === null ? null : { kind: "position", place: selected, ...record };
}

/**
 * The selected season's place and each earlier season's at the same share of its
 * length, as `Tämä kausi verrattuna` reads them; `null` where a season ranks the
 * club nowhere.
 *
 * decisions/070-season-summary-position.md
 */
export function seasonPlaces(
  teamId: number,
  selected: SeasonRead,
  earlier: readonly SeasonRead[]
): { selected: number | null; earlier: (number | null)[] } {
  const share = comparisonShare(teamId, selected);
  const place = (season: SeasonRead) => positionIn(season, share)?.place ?? null;
  return { selected: place(selected), earlier: earlier.map(place) };
}

/**
 * The direction, best before worst, in which `value` beats `MIN_EARLIER_SEASONS`
 * earlier figures in a row, newest first; `isBetter` says which is better, a larger
 * one by default. An equal figure, or a missing one, stops the count.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */
function recordAgainst(
  value: number,
  earlier: readonly (number | null)[],
  isBetter: (first: number, second: number) => boolean = (first, second) => first > second
): { direction: Direction; beaten: number; everySeason: boolean } | null {
  for (const direction of ["best", "worst"] as const) {
    const stop = earlier.findIndex((other) => {
      if (other === null) return true;
      return direction === "best" ? !isBetter(value, other) : !isBetter(other, value);
    });
    const beaten = stop === -1 ? earlier.length : stop;
    if (beaten >= MIN_EARLIER_SEASONS) {
      return { direction, beaten, everySeason: beaten === earlier.length };
    }
  }
  return null;
}

/**
 * The club records whose run ends in the selected season, one per direction:
 * a winning run before an unbeaten one, a losing run before a winless one.
 * `seasonLabel` is the label `Ennätykset` names the season by.
 *
 * decisions/066-season-summary.md
 */
export function runFacts(
  records: StreakRecords,
  seasonLabel: string,
  earlierSeasons: number
): RunFact[] {
  if (earlierSeasons < MIN_EARLIER_SEASONS) return [];

  const directions: ReadonlyArray<readonly StreakKind[]> = [
    ["wins", "unbeaten"],
    ["defeats", "winless"],
  ];
  return directions.flatMap((kinds) =>
    kinds
      .flatMap((run): RunFact[] => {
        const record = records[run];
        return record?.to === seasonLabel ? [{ kind: "run", run, length: record.length }] : [];
      })
      .slice(0, 1)
  );
}

/**
 * The upset fact, if Elo gave the win less than `UPSET_BELOW_PERCENT` as the
 * sentence rounds it.
 *
 * decisions/066-season-summary.md
 */
export function upsetFact(upset: Surprise | null): UpsetFact | null {
  if (upset === null || Math.round(upset.probability * 100) >= UPSET_BELOW_PERCENT) return null;
  return { kind: "upset", match: upset };
}

/**
 * Whether a fact speaks well of the season.
 *
 * decisions/066-season-summary.md
 */
export function isFavourable(fact: SummaryFact): boolean {
  switch (fact.kind) {
    case "upset":
      return true;
    case "run":
      return fact.run === "wins" || fact.run === "unbeaten";
    default:
      return fact.direction === "best";
  }
}

/**
 * On equal counts, the position first, then the run, home, away and clean
 * sheets; the upset last.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */
const TIE_ORDER: Record<SummaryFact["kind"], number> = {
  position: 0,
  run: 1,
  home: 2,
  away: 3,
  cleanSheets: 4,
  upset: 5,
};

/**
 * The block's facts in order, `MAX_FACTS` at most: favourable first, then the
 * fact beating more seasons, a run record beating all of them.
 *
 * decisions/066-season-summary.md
 */
export function rankFacts(facts: readonly SummaryFact[], earlierSeasons: number): SummaryFact[] {
  const beaten = (fact: SummaryFact): number => {
    if (fact.kind === "upset") return -1;
    return fact.kind === "run" ? earlierSeasons : fact.beaten;
  };
  return facts
    .toSorted(
      (left, right) =>
        Number(isFavourable(right)) - Number(isFavourable(left)) ||
        beaten(right) - beaten(left) ||
        TIE_ORDER[left.kind] - TIE_ORDER[right.kind]
    )
    .slice(0, MAX_FACTS);
}

/**
 * What a summary reads, from the caller: one orchestrator for both providers.
 * `seasons` is `null` when the club's seasons could not be looked up; `records`
 * is the same read `Ennätykset` makes, so the two agree.
 *
 * decisions/066-season-summary.md
 */
export type SummaryReaders<T extends SeasonKey> = {
  teamId: number;
  selected: SeasonKey;
  activeSeasonId: number;
  seasons: readonly T[] | null;
  isLeague: (competitionCode: string) => boolean;
  label: (seasonId: number) => string;
  read: (key: SeasonKey) => Promise<SeasonReadResult>;
  records: (seasons: readonly T[]) => Promise<StreakRecordsSeries>;
  upset: () => Promise<Surprise | null>;
};

/**
 * The block for one club and league season, with no later league season the
 * club has played a match in. Nothing else is read until the selected season
 * has `MIN_MATCHES` played.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */
export async function seasonSummaryFor<T extends SeasonKey>(
  readers: SummaryReaders<T>
): Promise<SeasonSummarySeries> {
  const { teamId, selected, seasons, isLeague } = readers;
  // A cup has no block whether or not the club's seasons could be read.
  if (!isLeague(selected.competitionCode)) return { status: "unavailable" };
  if (seasons === null) return { status: "error" };
  const leagues = leagueSeasons(seasons, isLeague);

  // A later season counts once the club has played in it: its fixtures are
  // stored before it starts. One played settles it, whichever others failed or
  // threw, so every read settles before a failure counts.
  const laterKeys = leagues.filter((season) => season.seasonId > selected.seasonId);
  const [selectedRead, laterSettled] = await Promise.all([
    settle(readers.read(selected)),
    Promise.all(laterKeys.map((key) => settle(readers.read(key)))),
  ]);
  const playedLater = laterSettled.some(
    (later) =>
      "value" in later && later.value.status === "ok" && playedBy(later.value.read, teamId) > 0
  );
  if (playedLater) return { status: "unavailable" };
  const read = settledValue(selectedRead);
  const laterReads = laterSettled.map(settledValue);
  if (read.status === "error" || laterReads.some((later) => later.status === "error")) {
    return { status: "error" };
  }
  if (read.status === "empty") return { status: "unavailable" };
  const sides = homeAwayStats(read.read.finished, teamId);
  if (sides.home.matches + sides.away.matches < MIN_MATCHES) return { status: "unavailable" };

  const earlierKeys = leagues
    .filter(
      (season) =>
        season.competitionCode === selected.competitionCode && season.seasonId < selected.seasonId
    )
    .toSorted((left, right) => right.seasonId - left.seasonId);
  // Too few earlier seasons for a run fact: the records are not read, so their
  // failure cannot hide the upset.
  const noRecords: StreakRecordsSeries = { status: "unavailable" };
  const [earlierReads, records, upset] = await Promise.all([
    Promise.all(earlierKeys.map(readers.read)),
    earlierKeys.length < MIN_EARLIER_SEASONS ? noRecords : readers.records(seasons),
    readers.upset(),
  ]);
  const earlier = readSeasons(earlierReads);
  if (earlier.status === "error" || records.status === "error") return { status: "error" };

  const earlierSides = earlier.reads.map((season) => homeAwayStats(season.finished, teamId));
  const places = seasonPlaces(teamId, read.read, earlier.reads);
  const seasonLabel = readers.label(selected.seasonId);
  const found = [
    sideFact(
      "home",
      sides.home,
      earlierSides.map((side) => side.home)
    ),
    sideFact(
      "away",
      sides.away,
      earlierSides.map((side) => side.away)
    ),
    positionFact(places.selected, places.earlier),
    cleanSheetFact(
      shownCleanSheetShare(read.read.finished, teamId),
      earlier.reads.map((season) => shownCleanSheetShare(season.finished, teamId))
    ),
    ...(records.status === "ok" ? runFacts(records.records, seasonLabel, earlierSides.length) : []),
    upsetFact(upset),
  ].filter((fact): fact is SummaryFact => fact !== null);
  if (found.length === 0) return { status: "unavailable" };

  return {
    status: "ok",
    facts: rankFacts(found, earlierSides.length),
    inProgress: selected.seasonId === readers.activeSeasonId,
    seasonLabel,
  };
}

/**
 * A read's outcome, its rejection kept for later rather than thrown at once.
 *
 * decisions/066-season-summary.md
 */
type Settled<V> = { value: V } | { reason: unknown };

function settle<V>(promise: Promise<V>): Promise<Settled<V>> {
  return promise.then(
    (value) => ({ value }),
    (reason: unknown) => ({ reason })
  );
}

function settledValue<V>(settled: Settled<V>): V {
  if ("reason" in settled) throw settled.reason;
  return settled.value;
}

/**
 * The club's finished matches in a season, home and away.
 *
 * decisions/066-season-summary.md
 */
function playedBy(season: SeasonRead, teamId: number): number {
  const { home, away } = homeAwayStats(season.finished, teamId);
  return home.matches + away.matches;
}
