import { describe, expect, it } from "vitest";
import {
  decideGuess,
  type Guess,
  guessPrice,
  judge,
  lateJoinShare,
  MAX_GUESSED_GOALS,
  mayUseFloor,
  nextPriceRise,
  outcomeOf,
  parseGuess,
  priceAt,
  type SettlingMatch,
  sameGuess,
  seasonGrant,
  settlementOf,
} from "@/lib/guessing-game";

/**
 * Arvauspeli's rules: the price curve and its boundaries, the reward tiers, a
 * late joiner's share, the floor, and what a guess from the browser may be.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */

const KICKOFF = new Date("2027-04-10T15:00:00Z");
const HOUR = 60 * 60 * 1000;
const hoursBefore = (hours: number) => new Date(KICKOFF.getTime() - hours * HOUR);

const outcome = (value: "1" | "X" | "2"): Guess => ({ kind: "outcome", outcome: value });
const score = (homeGoals: number, awayGoals: number): Guess => ({
  kind: "score",
  homeGoals,
  awayGoals,
});

describe("guessPrice", () => {
  it("prices a match TASO has not decided by its kickoff, whatever its status says", () => {
    for (const status of ["SCHEDULED", "Postponed"]) {
      expect(guessPrice({ kickoffAt: KICKOFF, status }, hoursBefore(400))).toBe(10);
    }
    expect(guessPrice({ kickoffAt: KICKOFF, status: "SCHEDULED" }, KICKOFF)).toBeNull();
  });

  it("closes a match TASO decided before its kickoff, a walkover or an abandonment", () => {
    for (const status of ["FINISHED", "Abandoned"]) {
      expect(guessPrice({ kickoffAt: KICKOFF, status }, hoursBefore(400))).toBeNull();
    }
  });
});

describe("priceAt", () => {
  it("costs 10 at a week or more before kickoff", () => {
    expect(priceAt(KICKOFF, hoursBefore(400))).toBe(10);
    expect(priceAt(KICKOFF, hoursBefore(168))).toBe(10);
  });

  it("costs 15 from just under a week, down to three days", () => {
    expect(priceAt(KICKOFF, new Date(hoursBefore(168).getTime() + 1))).toBe(15);
    expect(priceAt(KICKOFF, hoursBefore(72))).toBe(15);
  });

  it("costs 20 from just under three days, down to a day", () => {
    expect(priceAt(KICKOFF, new Date(hoursBefore(72).getTime() + 1))).toBe(20);
    expect(priceAt(KICKOFF, hoursBefore(24))).toBe(20);
  });

  it("costs 30 in the last day", () => {
    expect(priceAt(KICKOFF, new Date(hoursBefore(24).getTime() + 1))).toBe(30);
    expect(priceAt(KICKOFF, new Date(KICKOFF.getTime() - 1))).toBe(30);
  });

  it("is locked at kickoff and after it", () => {
    expect(priceAt(KICKOFF, KICKOFF)).toBeNull();
    expect(priceAt(KICKOFF, new Date(KICKOFF.getTime() + HOUR))).toBeNull();
  });
});

describe("nextPriceRise", () => {
  it("names the next price and the moment it starts", () => {
    expect(nextPriceRise(KICKOFF, hoursBefore(200))).toEqual({ price: 15, at: hoursBefore(168) });
    expect(nextPriceRise(KICKOFF, hoursBefore(100))).toEqual({ price: 20, at: hoursBefore(72) });
    expect(nextPriceRise(KICKOFF, hoursBefore(30))).toEqual({ price: 30, at: hoursBefore(24) });
  });

  it("has nothing to rise to in the last day, or once the match has started", () => {
    expect(nextPriceRise(KICKOFF, hoursBefore(10))).toBeNull();
    expect(nextPriceRise(KICKOFF, KICKOFF)).toBeNull();
  });
});

describe("outcomeOf", () => {
  it("reads a home win, a draw and an away win", () => {
    expect(outcomeOf(2, 1)).toBe("1");
    expect(outcomeOf(1, 1)).toBe("X");
    expect(outcomeOf(0, 3)).toBe("2");
  });
});

describe("judge", () => {
  it("pays a correct 1X2 guess 30 and a wrong one nothing", () => {
    expect(judge(outcome("1"), 2, 0)).toEqual({ tier: "outcome", reward: 30 });
    expect(judge(outcome("X"), 2, 2)).toEqual({ tier: "outcome", reward: 30 });
    expect(judge(outcome("2"), 2, 0)).toEqual({ tier: "miss", reward: 0 });
  });

  it("pays an exact score 100", () => {
    expect(judge(score(2, 1), 2, 1)).toEqual({ tier: "exact", reward: 100 });
  });

  it("pays the goal difference 40, a draw guessed as another draw included", () => {
    expect(judge(score(3, 2), 2, 1)).toEqual({ tier: "difference", reward: 40 });
    expect(judge(score(1, 1), 2, 2)).toEqual({ tier: "difference", reward: 40 });
  });

  it("pays the 1X2 alone 20", () => {
    expect(judge(score(3, 1), 2, 1)).toEqual({ tier: "outcome", reward: 20 });
  });

  it("pays a score guess with the wrong 1X2 nothing", () => {
    expect(judge(score(0, 1), 2, 1)).toEqual({ tier: "miss", reward: 0 });
  });

  it("gives only the highest tier: an exact score is not also paid its goal difference", () => {
    expect(judge(score(1, 0), 1, 0).reward).toBe(100);
  });
});

describe("lateJoinShare", () => {
  it("gives the whole balance when every match is still to come", () => {
    expect(lateJoinShare(177, 177)).toBe(1000);
  });

  it("gives the share of matches left, rounded down", () => {
    expect(lateJoinShare(100, 177)).toBe(564);
    expect(lateJoinShare(1, 177)).toBe(5);
  });

  it("gives nothing once no match is left", () => {
    expect(lateJoinShare(0, 177)).toBe(0);
  });

  it("gives the whole balance for a season with no match counted", () => {
    expect(lateJoinShare(0, 0)).toBe(1000);
  });
});

describe("seasonGrant", () => {
  const kickoffs = [hoursBefore(48), hoursBefore(24), KICKOFF];

  it("gives the whole balance to a player who joined before the first kickoff", () => {
    expect(seasonGrant(hoursBefore(100), kickoffs, true, 0)).toBe(1000);
  });

  it("gives a share by the matches still to come after joining", () => {
    expect(seasonGrant(hoursBefore(30), kickoffs, true, 0)).toBe(666);
  });

  it("counts a split not yet stored as the previous season's split, all still to come", () => {
    // Two of three stored matches played; six split matches to come: 7 of 9.
    expect(seasonGrant(hoursBefore(10), kickoffs, false, 6)).toBe(777);
  });

  it("ignores the previous season's split once this season's is stored", () => {
    expect(seasonGrant(hoursBefore(10), kickoffs, true, 6)).toBe(333);
  });
});

describe("mayUseFloor", () => {
  it("opens the floor below the cheapest price, with no guess waiting to be settled", () => {
    expect(mayUseFloor(9, false)).toBe(true);
    expect(mayUseFloor(0, false)).toBe(true);
  });

  it("stays closed at the cheapest price or above, even where a match costs more", () => {
    expect(mayUseFloor(10, false)).toBe(false);
    expect(mayUseFloor(25, false)).toBe(false);
  });

  it("stays closed while a guess is waiting to be settled", () => {
    expect(mayUseFloor(0, true)).toBe(false);
  });
});

describe("sameGuess", () => {
  it("matches the same 1X2 and the same score", () => {
    expect(sameGuess(outcome("X"), outcome("X"))).toBe(true);
    expect(sameGuess(score(2, 1), score(2, 1))).toBe(true);
  });

  it("tells apart another 1X2, another score, and the other kind", () => {
    expect(sameGuess(outcome("X"), outcome("1"))).toBe(false);
    expect(sameGuess(score(2, 1), score(1, 2))).toBe(false);
    expect(sameGuess(score(2, 1), score(2, 0))).toBe(false);
    expect(sameGuess(outcome("1"), score(1, 0))).toBe(false);
    expect(sameGuess(score(1, 0), outcome("1"))).toBe(false);
  });
});

describe("decideGuess", () => {
  const base = {
    guess: outcome("1"),
    price: 10,
    balance: 100,
    hasOpenGuess: false,
    postponed: false,
  };

  it("pays a new guess the current price", () => {
    expect(decideGuess({ ...base, existing: null })).toEqual({ kind: "new", price: 10 });
  });

  it("charges a change the current price on top, a change of kind included", () => {
    const existing = { id: 7, guess: score(1, 0), free: false };
    expect(decideGuess({ ...base, existing })).toEqual({ kind: "change", price: 10, guessId: 7 });
  });

  it("changes nothing for the same guess again, free or not", () => {
    expect(decideGuess({ ...base, existing: { id: 7, guess: outcome("1"), free: false } })).toEqual(
      {
        kind: "unchanged",
      }
    );
    expect(decideGuess({ ...base, existing: { id: 7, guess: outcome("1"), free: true } })).toEqual({
      kind: "unchanged",
    });
  });

  it("gives a postponed guess one change for nothing, the floor's free guess included", () => {
    expect(
      decideGuess({
        ...base,
        postponed: true,
        existing: { id: 7, guess: outcome("2"), free: false },
      })
    ).toEqual({ kind: "change", price: 0, guessId: 7 });
    expect(
      decideGuess({
        ...base,
        postponed: true,
        balance: 0,
        existing: { id: 7, guess: outcome("2"), free: true },
      })
    ).toEqual({ kind: "change", price: 0, guessId: 7 });
  });

  it("keeps a postponed floor's free guess a 1X2, and a paid one free to become a score", () => {
    expect(
      decideGuess({
        ...base,
        postponed: true,
        guess: score(1, 0),
        existing: { id: 7, guess: outcome("2"), free: true },
      })
    ).toEqual({ kind: "refused", reason: "free-fixed" });
    expect(
      decideGuess({
        ...base,
        postponed: true,
        guess: score(1, 0),
        existing: { id: 7, guess: outcome("2"), free: false },
      })
    ).toEqual({ kind: "change", price: 0, guessId: 7 });
  });

  it("refuses to change the floor's free guess", () => {
    const existing = { id: 7, guess: outcome("2"), free: true };
    expect(decideGuess({ ...base, existing })).toEqual({ kind: "refused", reason: "free-fixed" });
  });

  it("refuses a change the balance cannot pay", () => {
    const existing = { id: 7, guess: outcome("2"), free: false };
    expect(decideGuess({ ...base, balance: 9, existing })).toEqual({
      kind: "refused",
      reason: "insufficient",
    });
  });

  it("makes a 1X2 the floor's free guess when the balance is short and nothing is open", () => {
    expect(decideGuess({ ...base, balance: 5, existing: null })).toEqual({ kind: "free" });
  });

  it("refuses a balance that pays a cheaper match but not this one, rather than giving it free", () => {
    expect(decideGuess({ ...base, price: 30, balance: 25, existing: null })).toEqual({
      kind: "refused",
      reason: "insufficient",
    });
  });

  it("refuses a short balance's score guess, and its 1X2 while a guess is open", () => {
    expect(decideGuess({ ...base, guess: score(1, 0), balance: 5, existing: null })).toEqual({
      kind: "refused",
      reason: "insufficient",
    });
    expect(decideGuess({ ...base, balance: 5, hasOpenGuess: true, existing: null })).toEqual({
      kind: "refused",
      reason: "insufficient",
    });
  });
});

describe("parseGuess", () => {
  it("accepts 1, X and 2", () => {
    for (const value of ["1", "X", "2"] as const) {
      expect(parseGuess({ kind: "outcome", outcome: value })).toEqual(outcome(value));
    }
  });

  it("refuses any other outcome", () => {
    expect(parseGuess({ kind: "outcome", outcome: "x" })).toBeNull();
    expect(parseGuess({ kind: "outcome", outcome: 1 })).toBeNull();
    expect(parseGuess({ kind: "outcome" })).toBeNull();
  });

  it("accepts whole goal counts from 0 to the largest", () => {
    expect(parseGuess({ kind: "score", homeGoals: 0, awayGoals: MAX_GUESSED_GOALS })).toEqual(
      score(0, MAX_GUESSED_GOALS)
    );
  });

  it("refuses a goal count below 0, above the largest, fractional or not a number", () => {
    expect(parseGuess({ kind: "score", homeGoals: -1, awayGoals: 0 })).toBeNull();
    expect(
      parseGuess({ kind: "score", homeGoals: 0, awayGoals: MAX_GUESSED_GOALS + 1 })
    ).toBeNull();
    expect(parseGuess({ kind: "score", homeGoals: 1.5, awayGoals: 0 })).toBeNull();
    expect(parseGuess({ kind: "score", homeGoals: "1", awayGoals: 0 })).toBeNull();
    expect(parseGuess({ kind: "score", homeGoals: 1 })).toBeNull();
  });

  it("refuses anything that is not a guess at all", () => {
    expect(parseGuess(null)).toBeNull();
    expect(parseGuess("1")).toBeNull();
    expect(parseGuess({ kind: "winner", outcome: "1" })).toBeNull();
  });
});

describe("settlementOf", () => {
  const MADE = new Date("2027-04-10T12:00:00Z");
  function settling(overrides: Partial<SettlingMatch> = {}): SettlingMatch {
    return {
      status: "FINISHED",
      providerStatus: "Played",
      kickoffAt: KICKOFF,
      homeGoals: 2,
      awayGoals: 1,
      winner: "home",
      ...overrides,
    };
  }

  it("settles a played match by the tiers, with the result it was judged against", () => {
    expect(settlementOf(score(2, 1), MADE, settling())).toEqual({
      kind: "reward",
      settlement: "exact",
      reward: 100,
      result: { homeGoals: 2, awayGoals: 1 },
    });
    expect(settlementOf(outcome("2"), MADE, settling())).toMatchObject({
      settlement: "miss",
      reward: 0,
    });
  });

  it("waits while the match has no result, whatever its status", () => {
    expect(settlementOf(outcome("1"), MADE, settling({ homeGoals: null }))).toBeNull();
    expect(
      settlementOf(
        outcome("1"),
        MADE,
        settling({ status: "SCHEDULED", homeGoals: null, awayGoals: null })
      )
    ).toBeNull();
    expect(settlementOf(outcome("1"), MADE, settling({ status: "Break" }))).toBeNull();
  });

  it("voids a guess made at or after the stored kickoff, a kickoff moved earlier's", () => {
    expect(settlementOf(outcome("1"), KICKOFF, settling())).toEqual({
      kind: "refund",
      settlement: "void",
    });
    expect(settlementOf(outcome("1"), new Date(KICKOFF.getTime() - 1), settling())).toMatchObject({
      kind: "reward",
    });
  });

  it("refunds an abandoned match, with a result stored or not", () => {
    for (const goals of [{}, { homeGoals: null, awayGoals: null }]) {
      expect(settlementOf(score(2, 1), MADE, settling({ status: "Abandoned", ...goals }))).toEqual({
        kind: "refund",
        settlement: "abandoned",
      });
    }
  });

  it("pays every score guess on an awarded match as exact, and a 1X2 by the awarded score", () => {
    const forfeited = settling({ providerStatus: "Forfeited", homeGoals: 3, awayGoals: 0 });
    expect(settlementOf(score(0, 2), MADE, forfeited)).toEqual({
      kind: "reward",
      settlement: "awarded",
      reward: 100,
      result: { homeGoals: 3, awayGoals: 0 },
    });
    expect(settlementOf(outcome("1"), MADE, forfeited)).toMatchObject({
      settlement: "awarded",
      reward: 30,
    });
    expect(settlementOf(outcome("X"), MADE, forfeited)).toMatchObject({
      settlement: "awarded",
      reward: 0,
    });
  });

  it("settles an awarded match with no score by TASO's winner, and refunds one with neither", () => {
    const noScore = { providerStatus: "Forfeited", homeGoals: null, awayGoals: null } as const;
    expect(settlementOf(outcome("2"), MADE, settling({ ...noScore, winner: "away" }))).toEqual({
      kind: "reward",
      settlement: "awarded",
      reward: 30,
      result: null,
    });
    expect(settlementOf(outcome("X"), MADE, settling({ ...noScore, winner: "tie" }))).toMatchObject(
      { reward: 30 }
    );
    expect(settlementOf(score(1, 1), MADE, settling({ ...noScore, winner: "home" }))).toMatchObject(
      { reward: 100 }
    );
    expect(settlementOf(score(1, 1), MADE, settling({ ...noScore, winner: null }))).toEqual({
      kind: "refund",
      settlement: "undecided",
    });
  });
});
