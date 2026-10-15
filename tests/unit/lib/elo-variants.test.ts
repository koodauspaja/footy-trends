import { describe, expect, it } from "vitest";
import { type EloMatch, expectedHome, replayElo, splitThreeWay } from "@/lib/elo";
import {
  ELO_FORM_MODEL,
  ELO_HOME_MODEL,
  emptyVariantState,
  FORM_WEIGHT,
  FORM_WINDOW,
  formTerm,
  HOME_ADVANTAGE_MAX,
  HOME_ADVANTAGE_MIN,
  HOME_K,
  HOME_REGRESSION,
  homeAdvantageFor,
  learnKickoff,
  predictUpcomingVariants,
  replayVariants,
} from "@/lib/elo-variants";
import { PLACEHOLDER_TEAM_ID } from "@/lib/match-detail";

/**
 * The two Elo variants: the form term, each team's home advantage, what one
 * kickoff teaches them, and their predictions in a replay and of an upcoming
 * match.
 *
 * decisions/060-elo-variants.md
 */

let nextId = 1;
function played(
  day: number,
  homeTeam: number,
  awayTeam: number,
  homeGoals: number,
  awayGoals: number,
  overrides: Partial<EloMatch> = {}
): EloMatch {
  return {
    source: "taso",
    code: "VL",
    seasonId: 2025,
    providerMatchId: nextId++,
    kickoffAt: new Date(Date.UTC(2025, 4, day, 15)),
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    ...overrides,
  };
}

// Two 1500 sides, the flat 60: elo-v1's expected home score.
const EVEN = 1 / (1 + 10 ** (-60 / 400));

function at(match: EloMatch, home = 1500, away = 1500) {
  return { match, home, away };
}

describe("the constants", () => {
  it("are the spec's, named in the models", () => {
    expect({
      ELO_FORM_MODEL,
      ELO_HOME_MODEL,
      FORM_WINDOW,
      FORM_WEIGHT,
      HOME_K,
      HOME_ADVANTAGE_MIN,
      HOME_ADVANTAGE_MAX,
      HOME_REGRESSION,
    }).toEqual({
      ELO_FORM_MODEL: "elo-form-v1",
      ELO_HOME_MODEL: "elo-home-v1",
      FORM_WINDOW: 5,
      FORM_WEIGHT: 20,
      HOME_K: 4,
      HOME_ADVANTAGE_MIN: 0,
      HOME_ADVANTAGE_MAX: 150,
      HOME_REGRESSION: 1 / 3,
    });
  });
});

describe("formTerm", () => {
  it("is nothing for a team that has not played", () => {
    expect(formTerm(emptyVariantState(), 1, 2025)).toBe(0);
  });

  it("is 20 times each side's score above elo-v1's expectation", () => {
    const state = emptyVariantState();
    learnKickoff(state, [at(played(1, 1, 2, 2, 0))]);

    expect(formTerm(state, 1, 2025)).toBeCloseTo(20 * (1 - EVEN), 10);
    expect(formTerm(state, 2, 2025)).toBeCloseTo(20 * (0 - (1 - EVEN)), 10);
  });

  it("takes the expectation at the ratings the match was played at", () => {
    const state = emptyVariantState();
    learnKickoff(state, [at(played(1, 1, 2, 1, 1), 1600, 1400)]);

    expect(formTerm(state, 1, 2025)).toBeCloseTo(20 * (0.5 - expectedHome(1600, 1400)), 10);
  });

  it("keeps both of a team's matches at one kickoff in its form", () => {
    const state = emptyVariantState();
    // A stored duplicate: team 1 in two matches at one kickoff, both from 1500.
    learnKickoff(state, [at(played(1, 1, 2, 1, 0)), at(played(1, 1, 3, 1, 0))]);

    expect(formTerm(state, 1, 2025)).toBeCloseTo(2 * 20 * (1 - EVEN), 10);
    expect(state.form.get(1)?.surprises).toHaveLength(2);
  });

  it("counts the latest five matches only", () => {
    const state = emptyVariantState();
    // A loss first, then five wins: the loss falls out of the window.
    learnKickoff(state, [at(played(1, 1, 2, 0, 1))]);
    for (let day = 2; day <= 6; day += 1) learnKickoff(state, [at(played(day, 1, 2, 1, 0))]);

    expect(formTerm(state, 1, 2025)).toBeCloseTo(5 * 20 * (1 - EVEN), 10);
  });

  it("counts an older season's match as its own, as ratingFor does", () => {
    const state = emptyVariantState();
    learnKickoff(state, [at(played(1, 1, 2, 2, 0, { seasonId: 2026 }))]);

    expect(formTerm(state, 1, 2025)).toBeCloseTo(20 * (1 - EVEN), 10);

    learnKickoff(state, [at(played(2, 1, 2, 2, 0, { seasonId: 2025 }))]);
    expect(formTerm(state, 1, 2025)).toBeCloseTo(2 * 20 * (1 - EVEN), 10);
  });

  it("is nothing at a team's first match of a new season, and counts only that season after it", () => {
    const state = emptyVariantState();
    learnKickoff(state, [at(played(1, 1, 2, 3, 0))]);

    expect(formTerm(state, 1, 2026)).toBe(0);

    learnKickoff(state, [at(played(2, 1, 2, 0, 1, { seasonId: 2026 }))]);
    expect(formTerm(state, 1, 2026)).toBeCloseTo(20 * (0 - EVEN), 10);
  });
});

describe("homeAdvantageFor", () => {
  it("is 60 for a team never at home", () => {
    expect(homeAdvantageFor(emptyVariantState(), 1, 2025)).toBe(60);
  });

  it("keeps a team's own within its season, and moves it a third of the way back to 60 in a later one", () => {
    const state = emptyVariantState();
    state.home.set(1, { advantage: 120, seasonId: 2025 });

    expect(homeAdvantageFor(state, 1, 2025)).toBe(120);
    expect(homeAdvantageFor(state, 1, 2024)).toBe(120);
    expect(homeAdvantageFor(state, 1, 2026)).toBeCloseTo(120 - 60 / 3, 10);
  });
});

describe("learnKickoff, the home advantage", () => {
  it("moves the home side's by 4 times its score above the variant's own expectation", () => {
    const state = emptyVariantState();
    state.home.set(1, { advantage: 100, seasonId: 2025 });
    const own = 1 / (1 + 10 ** (-100 / 400));

    learnKickoff(state, [at(played(1, 1, 2, 2, 0))]);

    expect(homeAdvantageFor(state, 1, 2025)).toBeCloseTo(100 + 4 * (1 - own), 10);
  });

  it("leaves the away side's alone", () => {
    const state = emptyVariantState();
    state.home.set(2, { advantage: 90, seasonId: 2025 });

    learnKickoff(state, [at(played(1, 1, 2, 0, 3))]);

    expect(homeAdvantageFor(state, 2, 2025)).toBe(90);
  });

  it("regresses a later season's first home match before moving it", () => {
    const state = emptyVariantState();
    state.home.set(1, { advantage: 120, seasonId: 2024 });
    const start = 120 - 60 / 3;
    const own = 1 / (1 + 10 ** (-start / 400));

    learnKickoff(state, [at(played(1, 1, 2, 0, 0))]);

    expect(homeAdvantageFor(state, 1, 2025)).toBeCloseTo(start + 4 * (0.5 - own), 10);
  });

  it("is kept within 0–150", () => {
    const state = emptyVariantState();
    state.home.set(1, { advantage: 149.5, seasonId: 2025 });
    state.home.set(3, { advantage: 0.5, seasonId: 2025 });

    learnKickoff(state, [at(played(1, 1, 2, 5, 0)), at(played(1, 3, 4, 0, 5))]);

    expect(homeAdvantageFor(state, 1, 2025)).toBe(150);
    expect(homeAdvantageFor(state, 3, 2025)).toBe(0);
  });

  it("works out both of a team's home matches at one kickoff from the state before them", () => {
    const state = emptyVariantState();
    learnKickoff(state, [at(played(1, 1, 2, 1, 0)), at(played(1, 1, 3, 1, 0))]);

    expect(homeAdvantageFor(state, 1, 2025)).toBeCloseTo(60 + 2 * 4 * (1 - EVEN), 10);
  });
});

describe("replayVariants", () => {
  it("rates exactly as elo-v1's replay does", () => {
    const history = [played(3, 2, 1, 1, 1), played(1, 1, 2, 2, 0), played(2, 3, 1, 0, 2)];

    expect(replayVariants(history).ratings).toEqual(replayElo(history).ratings);
  });

  it("predicts each match from the state before its kickoff", () => {
    const first = played(1, 1, 2, 2, 0);
    const second = played(2, 1, 2, 0, 1);
    const seen: Array<{ id: number; form: number; home: number }> = [];

    replayVariants([second, first], (match, predict) => {
      const { form, home } = predict(0.25);
      seen.push({ id: match.providerMatchId, form: form.home, home: home.home });
    });

    // The first match: no form, the flat 60, both 1500. Its prediction is elo-v1's.
    const opening = splitThreeWay(EVEN, 0.25).home;
    expect(seen[0]).toEqual({ id: first.providerMatchId, form: opening, home: opening });

    // The second: elo-v1's ratings after day 1, each side's form, team 1's own advantage.
    const delta = 20 * (1 - EVEN);
    const formExpected = expectedHome(1500 + delta + delta, 1500 - delta - delta);
    const advantage = 60 + 4 * (1 - EVEN);
    const homeExpected = 1 / (1 + 10 ** ((1500 - delta - (1500 + delta + advantage)) / 400));
    expect(seen[1]?.id).toBe(second.providerMatchId);
    expect(seen[1]?.form).toBeCloseTo(splitThreeWay(formExpected, 0.25).home, 10);
    expect(seen[1]?.home).toBeCloseTo(splitThreeWay(homeExpected, 0.25).home, 10);
  });

  it("hands over predictions worked out at the match, whenever they are asked for", () => {
    const first = played(1, 1, 2, 2, 0);
    const second = played(2, 1, 2, 3, 0);
    const kept: Array<(drawShare: number) => { form: { home: number }; home: { home: number } }> =
      [];
    const atTheTime: number[] = [];

    replayVariants([first, second], (_match, predict) => {
      kept.push(predict);
      atTheTime.push(predict(0.25).form.home, predict(0.25).home.home);
    });

    // Asked after the whole replay, when both matches have been learned from.
    expect(kept.flatMap((predict) => [predict(0.25).form.home, predict(0.25).home.home])).toEqual(
      atTheTime
    );
  });

  it("predicts matches at one kickoff from the state before any of them", () => {
    const opener = played(1, 1, 2, 3, 0);
    const same = [played(2, 1, 3, 1, 0), played(2, 3, 1, 0, 1)];
    const forms: number[] = [];

    replayVariants([opener, ...same], (match, predict) => {
      if (match.kickoffAt.getTime() === same[0]?.kickoffAt.getTime()) {
        forms.push(predict(0.25).form.home);
      }
    });

    // Team 1's form from day 1 alone, in both day-2 matches.
    const delta = 20 * (1 - EVEN);
    expect(forms[0]).toBeCloseTo(
      splitThreeWay(expectedHome(1500 + delta + delta, 1500), 0.25).home,
      10
    );
    expect(forms[1]).toBeCloseTo(
      splitThreeWay(expectedHome(1500, 1500 + delta + delta), 0.25).home,
      10
    );
  });

  it("predicts a cup tie and learns nothing from it", () => {
    const league = played(1, 1, 2, 1, 0);
    const tie = played(2, 1, 2, 0, 4, { code: "MSC", cup: true });
    const after = played(3, 1, 2, 0, 0);
    const predicted: number[] = [];
    const atAfter = (history: EloMatch[]) => {
      let home: number | undefined;
      const { state } = replayVariants(history, (match, predict) => {
        predicted.push(match.providerMatchId);
        if (match.providerMatchId === after.providerMatchId) home = predict(0.25).home.home;
      });
      return { home, state };
    };

    const withTie = atAfter([league, tie, after]);
    const withoutTie = atAfter([league, after]);

    expect(predicted).toContain(tie.providerMatchId);
    expect(withTie.home).toEqual(expect.any(Number));
    expect(withTie.home).toBe(withoutTie.home);
    expect(withTie.state).toEqual(withoutTie.state);
  });
});

describe("predictUpcomingVariants", () => {
  it("predicts from the current ratings, regressed for a new season, and the state", () => {
    const { ratings, state } = replayVariants([played(1, 1, 2, 2, 0)]);

    const next = predictUpcomingVariants(
      ratings,
      state,
      { homeTeam: 1, awayTeam: 2, seasonId: 2025 },
      0.25
    );

    const delta = 20 * (1 - EVEN);
    const advantage = 60 + 4 * (1 - EVEN);
    expect(next?.form.home).toBeCloseTo(
      splitThreeWay(expectedHome(1500 + delta + delta, 1500 - delta - delta), 0.25).home,
      10
    );
    expect(next?.home.home).toBeCloseTo(
      splitThreeWay(1 / (1 + 10 ** ((1500 - delta - (1500 + delta + advantage)) / 400)), 0.25).home,
      10
    );

    // A new season: no form, the advantage and the ratings regressed.
    const later = predictUpcomingVariants(
      ratings,
      state,
      { homeTeam: 1, awayTeam: 2, seasonId: 2026 },
      0.25
    );
    const home = 1500 + delta - delta / 3;
    const away = 1500 - delta + delta / 3;
    expect(later?.form.home).toBeCloseTo(splitThreeWay(expectedHome(home, away), 0.25).home, 10);
    expect(later?.home.home).toBeCloseTo(
      splitThreeWay(
        1 / (1 + 10 ** ((away - (home + (advantage - (advantage - 60) / 3))) / 400)),
        0.25
      ).home,
      10
    );
  });

  it("predicts nothing for a placeholder side", () => {
    const { ratings, state } = replayVariants([]);
    expect(
      predictUpcomingVariants(
        ratings,
        state,
        { homeTeam: PLACEHOLDER_TEAM_ID, awayTeam: 2, seasonId: 2025 },
        0.25
      )
    ).toBeNull();
    expect(
      predictUpcomingVariants(
        ratings,
        state,
        { homeTeam: 1, awayTeam: PLACEHOLDER_TEAM_ID, seasonId: 2025 },
        0.25
      )
    ).toBeNull();
  });
});
