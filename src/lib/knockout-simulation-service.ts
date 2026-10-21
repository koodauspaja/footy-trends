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
import { type PoissonFit, type PoissonPrediction, predictPoisson } from "./poisson";
import { getPoissonFit } from "./poisson-service";
import { isRemainingFixture } from "./season-simulation";
import { getLeagueSeasonMatches } from "./standings-service";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonTables, type SeasonTable } from "./taso-standings-service";

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
 * A cup round's ties, one a match: TASO's verdict as the winner, a score once
 * finished. A match with a side not yet known is no tie.
 *
 * decisions/067-knockout-simulation.md
 */
export function cupTies(group: Pick<SeasonTable, "groupId" | "matches">): StoredTie[] {
  return group.matches.flatMap((match: NormalizedTasoMatch): StoredTie[] => {
    const { homeTeamProviderId: home, awayTeamProviderId: away } = match;
    if (home === PLACEHOLDER_TEAM_ID || away === PLACEHOLDER_TEAM_ID) return [];
    const finished =
      match.status === FINISHED_STATUS && match.homeGoals !== null && match.awayGoals !== null;
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
}

function sidesIn(ties: readonly StoredTie[]): Set<number> {
  return new Set(ties.flatMap((tie) => [tie.home.teamProviderId, tie.away.teamProviderId]));
}

/**
 * The rounds from the round of 16 on (S15): the first round of sixteen sides or
 * fewer, a power of two, with a side from the top division, and each round after
 * it holding half as many; none when the cup has not reached it.
 *
 * decisions/067-knockout-simulation.md
 */
export function fromLastSixteen(
  rounds: readonly StoredTie[][],
  topDivision: ReadonlySet<number>
): StoredTie[][] {
  const start = rounds.findIndex((ties) => {
    const sides = sidesIn(ties);
    const powerOfTwo = sides.size >= 2 && (sides.size & (sides.size - 1)) === 0;
    return (
      sides.size <= LAST_SIXTEEN && powerOfTwo && [...sides].some((side) => topDivision.has(side))
    );
  });
  if (start === -1) return [];
  const chosen = [rounds[start] as StoredTie[]];
  let size = sidesIn(chosen[0] as StoredTie[]).size;
  for (const ties of rounds.slice(start + 1)) {
    if (size <= 2 || sidesIn(ties).size > size / 2) break;
    size /= 2;
    chosen.push(ties);
  }
  return chosen;
}

/**
 * Every side of a league's season, from each of its groups' tables and matches.
 *
 * decisions/067-knockout-simulation.md
 */
function sidesOfSeason(tables: readonly SeasonTable[]): Set<number> {
  return new Set(
    tables.flatMap((table) => [
      ...table.standings.map((row) => row.teamProviderId),
      ...table.matches.flatMap((match) => [match.homeTeamProviderId, match.awayTeamProviderId]),
    ])
  );
}

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
 * The stand-in for an unrated side (S10, A2): the mean strengths of the division's
 * most recent season with a side in the fit, this season or the one before.
 *
 * decisions/067-knockout-simulation.md
 */
async function standInStrength(
  fit: PoissonFit,
  division: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ attack: number; defence: number }> {
  for (const season of [seasonId, seasonId - 1]) {
    const known = [
      ...sidesOfSeason((await readSeason(division, season, activeSeasonId)).tables),
    ].filter((side) => fit.attack.has(side));
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
  activeSeasonId: number,
  fit: PoissonFit,
  rounds: StoredTie[][]
): Promise<Exclude<CupForecastResult, { status: "error" }>> {
  const divisions = SUOMEN_CUPS[code] as { top: string; standIn: string };
  const rated = (tie: StoredTie) =>
    fit.attack.has(tie.home.teamProviderId) && fit.attack.has(tie.away.teamProviderId);
  const top = sidesOfSeason((await readSeason(divisions.top, seasonId, activeSeasonId)).tables);
  const simulated = fromLastSixteen(rounds, top);

  if (simulated.length === 0) {
    const open = rounds.flat().filter((tie) => tie.winner === null && rated(tie));
    return { status: "before", ties: tieChances(open, goalModel(fit, code)) };
  }
  const last = simulated.at(-1) as StoredTie[];
  if (last.length === 1 && last[0]?.winner != null) return { status: "no-fixtures" };

  const sides = [...sidesIn(simulated[0] as StoredTie[])];
  const unrated = sides.filter((side) => !fit.attack.has(side));
  const strength =
    unrated.length === 0
      ? { attack: 0, defence: 0 }
      : await standInStrength(fit, divisions.standIn, seasonId, activeSeasonId);
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
      { length: forecast.rows[0]?.reached.length ?? 0 },
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
  if (SUOMEN_CUPS[code] === undefined || seasonId !== activeSeasonId) {
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
        if (fitted.status === "error") throw new Error("The Poisson fit could not be read");
        const rounds = season.tables.map(cupTies).filter((ties) => ties.length > 0);
        if (rounds.length === 0 || !fitted.fit.competitions.has(code)) {
          return { value: { status: "unavailable" }, degraded: season.refreshFailed };
        }
        return {
          value: await cupForecastFrom(code, seasonId, activeSeasonId, fitted.fit, rounds),
          degraded: season.refreshFailed,
        };
      }
    );
  } catch (error) {
    logger.error({ err: error, source: "taso", code, seasonId }, "Unable to simulate the knockout");
    return { status: "error" };
  }
}
