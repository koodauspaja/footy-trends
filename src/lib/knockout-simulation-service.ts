/**
 * A knockout competition's forecast for its standings page: the season read as
 * the page reads it, predicted from the provider's cached Poisson fit, and
 * cached for 15 minutes. `knockout-simulation.ts` simulates.
 *
 * decisions/067-knockout-simulation.md
 */

import { getCachedUnlessDegraded } from "./cache";
import { type BracketSourceMatch, buildBracket } from "./cup-bracket";
import { LEAGUE_STAGE, resolvePhaseShape } from "./cup-stages";
import { buildCupPhaseStandings, type CupPhaseTable } from "./cup-standings";
import { categoryIdForSeason, competitionIdForSeason } from "./domestic-competitions";
import {
  type ChampionsLeagueForecast,
  type CupForecast,
  forecastChampionsLeague,
  forecastCup,
  KNOCKOUT_STAGES,
  legsPerTie,
  type StoredTie,
  type TieChance,
  tieChances,
  tieInPlay,
} from "./knockout-simulation";
import { logger } from "./logger";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";
import type { MatchSource } from "./match-source";
import {
  POISSON_HORIZON_DAYS,
  type PoissonFit,
  type PoissonPrediction,
  predictPoisson,
} from "./poisson";
import { getPoissonFit } from "./poisson-service";
import { isRemainingFixture } from "./season-simulation";
import { getLeagueSeasonMatches } from "./standings-service";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonTables, type SeasonTable, storedSeasonSides } from "./taso-standings-service";

/**
 * As long as the season forecast's, the table's and the fit's own caches (S6).
 *
 * decisions/067-knockout-simulation.md
 */
const KNOCKOUT_CACHE_TTL_SECONDS = 15 * 60;

/**
 * The competitions simulated as knockouts: the Champions League (S7).
 *
 * decisions/067-knockout-simulation.md
 */
const CHAMPIONS_LEAGUE = "CL";

/**
 * A leg's result stands once it is finished, or awarded with a score.
 *
 * decisions/067-knockout-simulation.md
 */
const SETTLED_STATUSES: ReadonlySet<string> = new Set(["FINISHED", "AWARDED"]);

/**
 * A leg that will not be played as listed, and is no leg of its tie.
 *
 * decisions/067-knockout-simulation.md
 */
const CALLED_OFF_STATUSES: ReadonlySet<string> = new Set(["CANCELLED", "Abandoned"]);

/**
 * A knockout competition's forecast, or why there is none: the final played, no
 * panel at all, or a failure.
 *
 * decisions/067-knockout-simulation.md
 */
export type KnockoutForecast =
  | ({ status: "ok" } & ChampionsLeagueForecast)
  | { status: "no-fixtures" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The cache entry of a season's knockout forecast. A forced refresh clears it,
 * with the answers it was computed from.
 *
 * decisions/067-knockout-simulation.md
 */
export function knockoutCacheKey(
  kind: MatchSource["kind"],
  code: string,
  seasonId: number
): string {
  return `knockout:v1:${kind}:${code}:${seasonId}`;
}

type SeasonMatch = BracketSourceMatch &
  Parameters<typeof buildCupPhaseStandings>[0][number] & { stage: string | null };

/**
 * The stored knockout ties by stage, each leg's score once it is finished. A tie
 * with a side not yet known is no pairing (S9), so its round is drawn.
 *
 * decisions/067-knockout-simulation.md
 */
export function storedTies(matches: readonly SeasonMatch[]): Map<string, StoredTie[]> {
  const statuses = new Map(matches.map((match) => [match.providerMatchId, match.status]));
  const known = (team: number | null) => team !== null && team !== PLACEHOLDER_TEAM_ID;
  return new Map(
    buildBracket([...matches]).map((round) => [
      round.stage,
      round.ties
        .filter((tie) => known(tie.home.teamProviderId) && known(tie.away.teamProviderId))
        .map((tie) => {
          const legs = tie.legs
            .filter((leg) => !CALLED_OFF_STATUSES.has(statuses.get(leg.providerMatchId) as string))
            .map((leg) => ({
              home: leg.homeTeamProviderId,
              away: leg.awayTeamProviderId,
              score:
                SETTLED_STATUSES.has(statuses.get(leg.providerMatchId) as string) &&
                leg.homeGoals !== null &&
                leg.awayGoals !== null
                  ? { home: leg.homeGoals, away: leg.awayGoals }
                  : null,
            }));
          const stored = { key: tie.key, home: tie.home, away: tie.away, winner: null, legs };
          const byScore = legs.length === legsPerTie(round.stage) ? decidedByScore(stored) : null;
          return { ...stored, winner: tie.winnerTeamProviderId ?? byScore };
        }),
    ])
  );
}

/**
 * The side a tie's scores send through when every leg is settled and the
 * aggregate is not level, awarded legs counted, which the bracket does not.
 *
 * decisions/067-knockout-simulation.md
 */
function decidedByScore(tie: StoredTie): number | null {
  if (tie.legs.length === 0 || tie.legs.some((leg) => leg.score === null)) return null;
  const { lead, first, second } = tieInPlay(tie);
  if (lead === 0) return null;
  return lead > 0 ? first : second;
}

/**
 * A leg's model from the fit: the Champions League predicts a side the fit has
 * no match of as an average one (specs/055 S4), so every known pairing has one.
 *
 * decisions/067-knockout-simulation.md
 */
function goalModel(
  fit: PoissonFit,
  code: string
): (home: number, away: number) => PoissonPrediction {
  return (home, away) => {
    const predicted = predictPoisson(fit, code, home, away);
    if (predicted === null) throw new Error(`No prediction for ${home} against ${away}`);
    return predicted;
  };
}

/**
 * The Champions League's season from its stored matches, or why there is no
 * figure to draw from it.
 *
 * decisions/067-knockout-simulation.md
 */
function forecastFrom(
  matches: readonly SeasonMatch[],
  fit: PoissonFit
): Exclude<KnockoutForecast, { status: "error" }> {
  // The 2024 format only, read from the data (S13).
  if (resolvePhaseShape([...matches]) !== "single" || !fit.competitions.has(CHAMPIONS_LEAGUE)) {
    return { status: "unavailable" };
  }
  const rounds = storedTies(matches);
  const final = rounds.get(KNOCKOUT_STAGES.at(-1) as string)?.[0];
  if (final?.winner != null) return { status: "no-fixtures" };

  // A single league phase is one table.
  const [phase] = buildCupPhaseStandings([...matches]) as [CupPhaseTable];
  const table = phase.standings.map(({ teamProviderId, teamName, points }) => ({
    teamProviderId,
    teamName,
    points,
  }));
  const model = goalModel(fit, CHAMPIONS_LEAGUE);
  const fixtures = matches
    .filter((match) => match.stage === LEAGUE_STAGE && isRemainingFixture(match))
    .map((match) => ({
      homeTeam: match.homeTeamProviderId,
      awayTeam: match.awayTeamProviderId,
      prediction: model(match.homeTeamProviderId, match.awayTeamProviderId).prediction,
    }));
  return { status: "ok", ...forecastChampionsLeague({ table, fixtures, rounds }, model) };
}

/**
 * The knockout forecast of the Champions League's season in progress, or why
 * there is none. `unavailable` is no panel: another competition or season, an
 * older format, nothing stored, or no match of it in the fit.
 *
 * decisions/067-knockout-simulation.md
 */
export async function getKnockoutForecast(
  kind: MatchSource["kind"],
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<KnockoutForecast> {
  if (kind !== "football-data" || code !== CHAMPIONS_LEAGUE || seasonId !== activeSeasonId) {
    return { status: "unavailable" };
  }

  try {
    return await getCachedUnlessDegraded(
      knockoutCacheKey(kind, code, seasonId),
      KNOCKOUT_CACHE_TTL_SECONDS,
      async (): Promise<{ value: KnockoutForecast; degraded: boolean }> => {
        const [fitted, season] = await Promise.all([
          getPoissonFit(kind),
          getLeagueSeasonMatches(code, seasonId, activeSeasonId),
        ]);
        // The fit has logged its own failure; a figure from no fit is not kept.
        if (fitted.status === "error") return { value: { status: "error" }, degraded: true };
        if (season.matches.length === 0) {
          if (season.refreshFailed) throw new Error("The season's matches could not be read");
          return { value: { status: "unavailable" }, degraded: false };
        }
        return {
          value: forecastFrom(season.matches, fitted.fit),
          degraded: season.refreshFailed,
        };
      }
    );
  } catch (error) {
    logger.error({ err: error, source: kind, code, seasonId }, "Unable to simulate the knockout");
    return { status: "error" };
  }
}

/**
 * The Suomen Cups simulated (S7): each with the top division whose sides mark
 * its round of 16 (S15) and the division an unrated side counts as (S10).
 *
 * decisions/067-knockout-simulation.md
 */
const SUOMEN_CUPS: Readonly<Record<string, { top: string; standIn: string }>> = {
  MSC: { top: "VL", standIn: "M2" },
  NSC: { top: "NL", standIn: "N1" },
};

/**
 * Whether a competition has a cup forecast: the two Suomen Cups.
 *
 * decisions/067-knockout-simulation.md
 */
export function hasCupForecast(code: string): boolean {
  return SUOMEN_CUPS[code] !== undefined;
}

/**
 * The most sides the round a cup is simulated from may hold (S15).
 *
 * decisions/067-knockout-simulation.md
 */
const LAST_SIXTEEN = 16;

/**
 * A Suomen Cup's forecast: from its round of 16, every side's chances and the
 * division the unrated ones count as, when one is left; before it, the rated
 * ties only (S16). Otherwise as a knockout forecast's.
 *
 * decisions/067-knockout-simulation.md
 */
export type CupForecastResult =
  | ({ status: "ok"; roundSizes: number[]; standIn: string | null } & CupForecast)
  | { status: "before"; ties: TieChance[] }
  | { status: "no-fixtures" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * A cup round as stored: its ties between known sides, a match each, TASO's
 * verdict the winner and a score once finished; and how many sides it holds, a
 * side not yet known included. A called-off match is no tie.
 *
 * decisions/067-knockout-simulation.md
 */
export type CupRound = { ties: StoredTie[]; size: number };

export function cupRound(group: Pick<SeasonTable, "groupId" | "matches">): CupRound {
  const listed = group.matches.filter((match) => !CALLED_OFF_STATUSES.has(match.status));
  const ties = listed.flatMap((match: NormalizedTasoMatch): StoredTie[] => {
    const { homeTeamProviderId: home, awayTeamProviderId: away } = match;
    if (home === PLACEHOLDER_TEAM_ID || away === PLACEHOLDER_TEAM_ID) return [];
    const finished =
      SETTLED_STATUSES.has(match.status) && match.homeGoals !== null && match.awayGoals !== null;
    const winner = { home, away, tie: null }[match.winner ?? "tie"];
    return [
      {
        key: `${group.groupId}:${match.providerMatchId}`,
        home: { teamProviderId: home, teamName: match.homeTeamName },
        away: { teamProviderId: away, teamName: match.awayTeamName },
        winner: winner ?? null,
        legs: [
          {
            home,
            away,
            score: finished
              ? { home: match.homeGoals as number, away: match.awayGoals as number }
              : null,
          },
        ],
      },
    ];
  });
  return { ties, size: 2 * listed.length };
}

function sidesIn(ties: readonly StoredTie[]): Set<number> {
  return new Set(ties.flatMap((tie) => [tie.home.teamProviderId, tie.away.teamProviderId]));
}

/**
 * The rounds from the round of 16 on (S15): the first round of sixteen sides or
 * fewer, a power of two, with a side from the top division, and each round after
 * it holding half as many or fewer; none when the cup has not reached it.
 *
 * decisions/067-knockout-simulation.md
 */
export function fromLastSixteen(
  rounds: readonly CupRound[],
  topDivision: ReadonlySet<number>
): CupRound[] {
  const start = rounds.findIndex(
    ({ ties, size }) =>
      size <= LAST_SIXTEEN &&
      size >= 2 &&
      (size & (size - 1)) === 0 &&
      [...sidesIn(ties)].some((side) => topDivision.has(side))
  );
  if (start === -1) return [];
  const chosen = [rounds[start] as CupRound];
  let size = (rounds[start] as CupRound).size;
  for (const round of rounds.slice(start + 1)) {
    if (round.size > size / 2) break;
    size /= 2;
    chosen.push(round);
  }
  return chosen;
}

/**
 * A cup's season as its standings page reads it; nothing stored is no rounds.
 *
 * decisions/067-knockout-simulation.md
 */
async function readSeason(code: string, seasonId: number, activeSeasonId: number) {
  const season = await getSeasonTables(
    categoryIdForSeason(code, seasonId),
    competitionIdForSeason(code, seasonId),
    seasonId,
    activeSeasonId
  );
  if (season.status === "error") throw new Error(`${code} ${seasonId} could not be read`);
  return season.status === "ok" ? season : { tables: [], refreshFailed: false };
}

/**
 * The seasons the fit can hold a match of, this one included.
 *
 * decisions/067-knockout-simulation.md
 */
const FIT_SEASONS = Math.ceil(POISSON_HORIZON_DAYS / 365) + 1;

/**
 * The stand-in for an unrated side (S10, A2): the mean strengths of the
 * division's sides in its most recent season with a side in the fit; with none,
 * an average side.
 *
 * decisions/067-knockout-simulation.md
 */
async function standInStrength(
  fit: PoissonFit,
  division: string,
  seasonId: number
): Promise<{ attack: number; defence: number }> {
  for (let season = seasonId; season > seasonId - FIT_SEASONS; season -= 1) {
    const known = [...(await storedSeasonSides(division, season))].filter((side) =>
      fit.attack.has(side)
    );
    if (known.length === 0) continue;
    const mean = (strengths: ReadonlyMap<number, number>) =>
      known.reduce((total, side) => total + (strengths.get(side) as number), 0) / known.length;
    return { attack: mean(fit.attack), defence: mean(fit.defence) };
  }
  return { attack: 0, defence: 0 };
}

/**
 * The fit with every unrated side given the stand-in's strengths: only inside
 * the simulation, so no tie's own `Ennuste` changes (S10).
 *
 * decisions/067-knockout-simulation.md
 */
function withStandIns(
  fit: PoissonFit,
  sides: readonly number[],
  strength: { attack: number; defence: number }
): PoissonFit {
  const attack = new Map(fit.attack);
  const defence = new Map(fit.defence);
  for (const side of sides) {
    attack.set(side, strength.attack);
    defence.set(side, strength.defence);
  }
  return { ...fit, attack, defence };
}

/**
 * A Suomen Cup's season from its stored rounds and the fit.
 *
 * decisions/067-knockout-simulation.md
 */
async function cupForecastFrom(
  code: string,
  seasonId: number,
  fit: PoissonFit,
  rounds: CupRound[]
): Promise<Exclude<CupForecastResult, { status: "error" }>> {
  const divisions = SUOMEN_CUPS[code] as { top: string; standIn: string };
  const rated = (tie: StoredTie) =>
    fit.attack.has(tie.home.teamProviderId) && fit.attack.has(tie.away.teamProviderId);
  const chosen = fromLastSixteen(rounds, await storedSeasonSides(divisions.top, seasonId));
  const [first] = chosen;

  // Until every side of the round of 16 is known, only the current round's ties.
  if (first === undefined || 2 * first.ties.length !== first.size) {
    const current = rounds.findLast((round) => round.ties.some((tie) => tie.winner === null));
    const open = (current?.ties ?? []).filter(rated);
    return { status: "before", ties: tieChances(open, goalModel(fit, code)) };
  }
  const simulated = chosen.map((round) => round.ties);
  const sides = [...sidesIn(first.ties)];
  // The final is the round counted from the round of 16, not whichever came last.
  const final = simulated[Math.log2(sides.length) - 1];
  if (final?.[0]?.winner != null) return { status: "no-fixtures" };

  const unrated = sides.filter((side) => !fit.attack.has(side));
  const strength =
    unrated.length === 0
      ? { attack: 0, defence: 0 }
      : await standInStrength(fit, divisions.standIn, seasonId);
  const forecast = forecastCup(
    { rounds: simulated },
    goalModel(withStandIns(fit, unrated, strength), code)
  );
  const left = new Set(forecast.rows.map((row) => row.teamProviderId));
  const ratedIds = new Set(
    simulated
      .flat()
      .filter(rated)
      .map((tie) => tie.key)
  );
  return {
    status: "ok",
    roundSizes: Array.from(
      { length: Math.log2(sides.length) },
      (_, round) => sides.length / 2 ** round
    ),
    standIn: unrated.some((side) => left.has(side)) ? divisions.standIn : null,
    rows: forecast.rows,
    ties: forecast.ties.filter((tie) => ratedIds.has(tie.key)),
  };
}

/**
 * The forecast of a Suomen Cup's season in progress, or why there is none.
 * `unavailable` is no section: another competition or season, nothing stored,
 * or no match of the cup in the fit.
 *
 * decisions/067-knockout-simulation.md
 */
export async function getCupForecast(
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<CupForecastResult> {
  if (!hasCupForecast(code) || seasonId !== activeSeasonId) {
    return { status: "unavailable" };
  }

  try {
    return await getCachedUnlessDegraded(
      knockoutCacheKey("taso", code, seasonId),
      KNOCKOUT_CACHE_TTL_SECONDS,
      async (): Promise<{ value: CupForecastResult; degraded: boolean }> => {
        const [fitted, season] = await Promise.all([
          getPoissonFit("taso"),
          readSeason(code, seasonId, activeSeasonId),
        ]);
        // The fit has logged its own failure; a figure from no fit is not kept.
        if (fitted.status === "error") return { value: { status: "error" }, degraded: true };
        const rounds = season.tables.map(cupRound).filter((round) => round.size > 0);
        if (rounds.length === 0 || !fitted.fit.competitions.has(code)) {
          return { value: { status: "unavailable" }, degraded: season.refreshFailed };
        }
        return {
          value: await cupForecastFrom(code, seasonId, fitted.fit, rounds),
          degraded: season.refreshFailed,
        };
      }
    );
  } catch (error) {
    logger.error({ err: error, source: "taso", code, seasonId }, "Unable to simulate the knockout");
    return { status: "error" };
  }
}
