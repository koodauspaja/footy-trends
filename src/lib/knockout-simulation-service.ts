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
import {
  type ChampionsLeagueForecast,
  forecastChampionsLeague,
  KNOCKOUT_STAGES,
  type StoredTie,
} from "./knockout-simulation";
import { logger } from "./logger";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";
import type { MatchSource } from "./match-source";
import { type PoissonFit, type PoissonPrediction, predictPoisson } from "./poisson";
import { getPoissonFit } from "./poisson-service";
import { isRemainingFixture } from "./season-simulation";
import { getLeagueSeasonMatches } from "./standings-service";

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
  const finished = new Map(
    matches.map((match) => [match.providerMatchId, SETTLED_STATUSES.has(match.status)])
  );
  const known = (team: number | null) => team !== null && team !== PLACEHOLDER_TEAM_ID;
  return new Map(
    buildBracket([...matches]).map((round) => [
      round.stage,
      round.ties
        .filter((tie) => known(tie.home.teamProviderId) && known(tie.away.teamProviderId))
        .map((tie) => ({
          key: tie.key,
          home: tie.home,
          away: tie.away,
          winner: tie.winnerTeamProviderId,
          legs: tie.legs.map((leg) => ({
            home: leg.homeTeamProviderId,
            away: leg.awayTeamProviderId,
            score:
              finished.get(leg.providerMatchId) === true &&
              leg.homeGoals !== null &&
              leg.awayGoals !== null
                ? { home: leg.homeGoals, away: leg.awayGoals }
                : null,
          })),
        })),
    ])
  );
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
        if (fitted.status === "error") throw new Error("The Poisson fit could not be read");
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
