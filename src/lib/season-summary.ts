/**
 * A club's most recent league season in up to three facts, each a headline over
 * a number another panel already shows. Pure: the services pass the seasons in.
 *
 * decisions/066-season-summary.md
 */
import { homeAwayStats, pointsPerMatch, type SideStats } from "./home-away";
import {
  leagueSeasons,
  readSeasons,
  type SeasonKey,
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
 * How many sentences a block holds at most.
 *
 * decisions/066-season-summary.md
 */
export const MAX_FACTS = 3;

export type Direction = "best" | "worst";

/**
 * A home or away record: points per match at one decimal, and how many earlier
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

export type SummaryFact = SideFact | RunFact | UpsetFact;

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
 * Points per match as `Koti- ja vierastilastot` prints it, one decimal, or
 * `null` for a side with no match. Two seasons the panel shows alike are equal.
 *
 * decisions/066-season-summary.md
 */
export function shownPointsPerMatch(side: SideStats): number | null {
  const value = pointsPerMatch(side);
  return value === null ? null : Number(value.toFixed(1));
}

/**
 * The home or away fact, if the selected season's side beats at least
 * `MIN_EARLIER_SEASONS` earlier seasons in a row, newest first. A season it
 * only equals, or one with no match on that side, stops the count.
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
  if (earlier.length < MIN_EARLIER_SEASONS) return null;

  for (const direction of ["best", "worst"] as const) {
    const beaten = beatenInARow(value, earlier, direction);
    if (beaten >= MIN_EARLIER_SEASONS) {
      return {
        kind,
        direction,
        pointsPerMatch: value,
        beaten,
        everySeason: beaten === earlier.length,
      };
    }
  }
  return null;
}

function beatenInARow(value: number, earlier: readonly SideStats[], direction: Direction): number {
  const stop = earlier.findIndex((side) => {
    const other = shownPointsPerMatch(side);
    if (other === null) return true;
    return direction === "best" ? value <= other : value >= other;
  });
  return stop === -1 ? earlier.length : stop;
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

// On equal counts, the run first, then home, then away; the upset last.
const TIE_ORDER: Record<SummaryFact["kind"], number> = { run: 0, home: 1, away: 2, upset: 3 };

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
 * `records` is the same read `Ennätykset` makes, so the two agree.
 *
 * decisions/066-season-summary.md
 */
export type SummaryReaders<T extends SeasonKey> = {
  teamId: number;
  selected: SeasonKey;
  activeSeasonId: number;
  seasons: readonly T[];
  isLeague: (competitionCode: string) => boolean;
  label: (seasonId: number) => string;
  read: (key: SeasonKey) => Promise<SeasonReadResult>;
  records: () => Promise<StreakRecordsSeries>;
  upset: () => Promise<Surprise | null>;
};

/**
 * The block for one club and season. Nothing is read beyond the selected
 * season until it is known to be the club's latest league season with
 * `MIN_MATCHES` played.
 *
 * decisions/066-season-summary.md
 */
export async function seasonSummaryFor<T extends SeasonKey>(
  readers: SummaryReaders<T>
): Promise<SeasonSummarySeries> {
  const { teamId, selected, seasons, isLeague } = readers;
  const leagues = leagueSeasons(seasons, isLeague);
  const latest = Math.max(...leagues.map((season) => season.seasonId));
  if (!isLeague(selected.competitionCode) || selected.seasonId !== latest) {
    return { status: "unavailable" };
  }

  const read = await readers.read(selected);
  if (read.status !== "ok") return read.status === "error" ? read : { status: "unavailable" };
  const sides = homeAwayStats(read.read.finished, teamId);
  if (sides.home.matches + sides.away.matches < MIN_MATCHES) return { status: "unavailable" };

  const earlierKeys = leagues
    .filter(
      (season) =>
        season.competitionCode === selected.competitionCode && season.seasonId < selected.seasonId
    )
    .toSorted((left, right) => right.seasonId - left.seasonId);
  const [earlierReads, records, upset] = await Promise.all([
    Promise.all(earlierKeys.map(readers.read)),
    readers.records(),
    readers.upset(),
  ]);
  const earlier = readSeasons(earlierReads);
  if (earlier.status === "error" || records.status === "error") return { status: "error" };

  const earlierSides = earlier.reads.map((season) => homeAwayStats(season.finished, teamId));
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
