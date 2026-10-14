/**
 * Two variants of Elo, each logged as a model of its own beside `elo-v1`: a
 * form term from a team's recent results, and each team's own home advantage.
 * Both read `elo-v1`'s ratings and never change them. Pure: the services read
 * the finished matches.
 *
 * decisions/060-elo-variants.md
 */

import {
  ELO_HOME_ADVANTAGE,
  type EloMatch,
  expectedHome,
  homeScore,
  type PlayedMatch,
  ratingFor,
  replayElo,
  splitThreeWay,
  type TeamRating,
  type ThreeWay,
} from "./elo";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";

/**
 * The form-weighted variant's name in the predictions log; a change to any of
 * its constants is a new one.
 *
 * decisions/060-elo-variants.md
 */
export const ELO_FORM_MODEL = "elo-form-v1";

/**
 * The home-adjusted variant's name in the predictions log; a change to any of
 * its constants is a new one.
 *
 * decisions/060-elo-variants.md
 */
export const ELO_HOME_MODEL = "elo-home-v1";

/**
 * How many of a team's latest matches of the season its form counts.
 *
 * decisions/060-elo-variants.md
 */
export const FORM_WINDOW = 5;

/**
 * Rating points per point of score above expectation in the form window.
 *
 * decisions/060-elo-variants.md
 */
export const FORM_WEIGHT = 20;

/**
 * How far one home result moves a team's home advantage.
 *
 * decisions/060-elo-variants.md
 */
export const HOME_K = 4;

/**
 * The bounds a team's home advantage is kept within.
 *
 * decisions/060-elo-variants.md
 */
export const HOME_ADVANTAGE_MIN = 0;
export const HOME_ADVANTAGE_MAX = 150;

/**
 * How far back to 60 a home advantage moves at a team's first match of a new
 * season.
 *
 * decisions/060-elo-variants.md
 */
export const HOME_REGRESSION = 1 / 3;

/**
 * A team's form: its score above expectation in each of its latest matches of
 * one season, oldest first, at most `FORM_WINDOW`.
 *
 * decisions/060-elo-variants.md
 */
type TeamForm = { seasonId: number; surprises: number[] };

/**
 * A team's home advantage, and the season it last played at home in.
 *
 * decisions/060-elo-variants.md
 */
type TeamHome = { advantage: number; seasonId: number };

/**
 * What the two variants know of every team at one moment of a replay.
 *
 * decisions/060-elo-variants.md
 */
export type VariantState = {
  form: Map<number, TeamForm>;
  home: Map<number, TeamHome>;
};

/**
 * The two sides of a match, its season, and the `elo-v1` ratings both go into
 * it with.
 *
 * decisions/060-elo-variants.md
 */
type RatedFixture = {
  homeTeam: number;
  awayTeam: number;
  seasonId: number;
  home: number;
  away: number;
};

function fixtureOf({ match, home, away }: PlayedMatch): RatedFixture {
  return {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    seasonId: match.seasonId,
    home,
    away,
  };
}

export function emptyVariantState(): VariantState {
  return { form: new Map(), home: new Map() };
}

/**
 * A team's form term going into a match of `seasonId`: the weight times its
 * score above expectation over its latest matches of that season, none at its
 * first match of a season.
 *
 * decisions/060-elo-variants.md
 */
export function formTerm(state: VariantState, team: number, seasonId: number): number {
  const known = state.form.get(team);
  if (known === undefined || known.seasonId !== seasonId) return 0;
  return FORM_WEIGHT * known.surprises.reduce((sum, surprise) => sum + surprise, 0);
}

/**
 * A team's home advantage going into a home match of `seasonId`: 60 for a
 * team never at home, and a third of the way back to 60 at its first home
 * match of a later season.
 *
 * decisions/060-elo-variants.md
 */
export function homeAdvantageFor(state: VariantState, team: number, seasonId: number): number {
  const known = state.home.get(team);
  if (known === undefined) return ELO_HOME_ADVANTAGE;
  if (seasonId <= known.seasonId) return known.advantage;
  return known.advantage + (ELO_HOME_ADVANTAGE - known.advantage) * HOME_REGRESSION;
}

function clampAdvantage(advantage: number): number {
  return Math.min(HOME_ADVANTAGE_MAX, Math.max(HOME_ADVANTAGE_MIN, advantage));
}

/**
 * The home side's expected score with each side's form added to its rating,
 * and the flat 60.
 *
 * decisions/060-elo-variants.md
 */
function formExpected(state: VariantState, fixture: RatedFixture): number {
  return expectedHome(
    fixture.home + formTerm(state, fixture.homeTeam, fixture.seasonId),
    fixture.away + formTerm(state, fixture.awayTeam, fixture.seasonId)
  );
}

/**
 * The home side's expected score with its own home advantage in place of 60.
 *
 * decisions/060-elo-variants.md
 */
function homeExpected(state: VariantState, fixture: RatedFixture): number {
  const advantage = homeAdvantageFor(state, fixture.homeTeam, fixture.seasonId);
  return 1 / (1 + 10 ** ((fixture.away - (fixture.home + advantage)) / 400));
}

/**
 * The two variants' predictions of a match from the ratings it was played at.
 *
 * decisions/060-elo-variants.md
 */
function predictVariants(
  state: VariantState,
  fixture: RatedFixture,
  drawShare: number
): { form: ThreeWay; home: ThreeWay } {
  return {
    form: splitThreeWay(formExpected(state, fixture), drawShare),
    home: splitThreeWay(homeExpected(state, fixture), drawShare),
  };
}

/**
 * One kickoff's league matches learned from: every change is worked out from
 * the state before any of them, then applied. Form takes each side's score
 * above `elo-v1`'s expectation; the home side's advantage moves by its score
 * above the variant's own.
 *
 * decisions/060-elo-variants.md
 */
export function learnKickoff(state: VariantState, played: readonly PlayedMatch[]): void {
  const surprises: Array<{ team: number; seasonId: number; surprise: number }> = [];
  const advantages = new Map<number, { advantage: number; seasonId: number }>();
  for (const one of played) {
    const { match } = one;
    const score = homeScore(match);
    const expected = expectedHome(one.home, one.away);
    surprises.push(
      { team: match.homeTeam, seasonId: match.seasonId, surprise: score - expected },
      { team: match.awayTeam, seasonId: match.seasonId, surprise: expected - score }
    );
    const before =
      advantages.get(match.homeTeam)?.advantage ??
      homeAdvantageFor(state, match.homeTeam, match.seasonId);
    advantages.set(match.homeTeam, {
      advantage: before + HOME_K * (score - homeExpected(state, fixtureOf(one))),
      seasonId: match.seasonId,
    });
  }

  for (const { team, seasonId, surprise } of surprises) {
    const known = state.form.get(team);
    const kept = known?.seasonId === seasonId ? known.surprises : [];
    state.form.set(team, { seasonId, surprises: [...kept, surprise].slice(-FORM_WINDOW) });
  }
  for (const [team, { advantage, seasonId }] of advantages) {
    state.home.set(team, { advantage: clampAdvantage(advantage), seasonId });
  }
}

/**
 * Elo's replay with the variants' state kept beside it: `onPredict` sees each
 * match with the ratings it was played at and the variants' predictions from
 * the state before its kickoff. A cup tie is predicted and never learned from.
 *
 * decisions/060-elo-variants.md
 */
export function replayVariants(
  matches: readonly EloMatch[],
  onPredict?: (
    match: EloMatch,
    predict: (drawShare: number) => { form: ThreeWay; home: ThreeWay }
  ) => void
): { ratings: Map<number, TeamRating>; state: VariantState } {
  const state = emptyVariantState();
  const { ratings } = replayElo(
    matches,
    onPredict === undefined
      ? undefined
      : (match, home, away) =>
          onPredict(match, (drawShare) =>
            predictVariants(state, fixtureOf({ match, home, away }), drawShare)
          ),
    (played) => learnKickoff(state, played)
  );
  return { ratings, state };
}

/**
 * An upcoming match's two variant predictions from the current ratings and
 * state, or null when a side is a placeholder.
 *
 * decisions/060-elo-variants.md
 */
export function predictUpcomingVariants(
  ratings: ReadonlyMap<number, TeamRating>,
  state: VariantState,
  match: { homeTeam: number; awayTeam: number; seasonId: number },
  drawShare: number
): { form: ThreeWay; home: ThreeWay } | null {
  if (match.homeTeam === PLACEHOLDER_TEAM_ID || match.awayTeam === PLACEHOLDER_TEAM_ID) return null;
  return predictVariants(
    state,
    {
      ...match,
      home: ratingFor(ratings, match.homeTeam, match.seasonId),
      away: ratingFor(ratings, match.awayTeam, match.seasonId),
    },
    drawShare
  );
}
