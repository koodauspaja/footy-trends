import { describe, expect, it } from "vitest";
import { backtestRows, type FinishedMatch } from "@/lib/prediction-backtest";

const NOW = new Date("2026-10-03T12:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 3, n, 15));

let nextId = 1;
function played(n: number, home: number, away: number, overrides: Partial<FinishedMatch> = {}) {
  return {
    source: "taso" as const,
    code: "VL",
    providerMatchId: nextId++,
    kickoffAt: day(n),
    homeGoals: home,
    awayGoals: away,
    ...overrides,
  };
}

describe("backtestRows (S2, S14)", () => {
  it("predicts each match from the matches strictly before it, as specs/051 would have", () => {
    const first = played(1, 2, 0);
    const second = played(2, 1, 1);
    const third = played(3, 0, 1);

    const rows = backtestRows([third, first, second], "home-baseline-v1", NOW);

    expect(rows).toEqual([
      expect.objectContaining({
        providerMatchId: second.providerMatchId,
        homeProbability: 1,
        drawProbability: 0,
        awayProbability: 0,
      }),
      expect.objectContaining({
        providerMatchId: third.providerMatchId,
        homeProbability: 0.5,
        drawProbability: 0.5,
        awayProbability: 0,
      }),
    ]);
  });

  it("gives a competition's first match no row: nothing came before it", () => {
    const first = played(1, 2, 0);

    expect(backtestRows([first], "home-baseline-v1", NOW)).toEqual([]);
  });

  it("does not let matches sharing a kickoff inform each other", () => {
    const opener = played(1, 0, 2);
    const together = [played(5, 3, 0), played(5, 3, 0)];
    const after = played(6, 1, 1);

    const rows = backtestRows([opener, ...together, after], "home-baseline-v1", NOW);

    for (const match of together) {
      expect(rows.find((row) => row.providerMatchId === match.providerMatchId)).toMatchObject({
        homeProbability: 0,
        awayProbability: 1,
      });
    }
    // Both count for the match after them.
    expect(rows.find((row) => row.providerMatchId === after.providerMatchId)).toMatchObject({
      homeProbability: expect.closeTo(2 / 3, 10),
      awayProbability: expect.closeTo(1 / 3, 10),
    });
  });

  it("keeps each competition's history, and each provider's, apart", () => {
    const rows = backtestRows(
      [
        played(1, 2, 0),
        played(2, 0, 1, { code: "M1" }),
        played(3, 0, 1, { code: "M1" }),
        played(3, 1, 0, { source: "football-data", code: "VL" }),
      ],
      "home-baseline-v1",
      NOW
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ competitionCode: "M1", awayProbability: 1 });
  });

  it("counts a level score as a draw — the shoot-out is already out of it", () => {
    const rows = backtestRows([played(1, 1, 1), played(2, 4, 0)], "home-baseline-v1", NOW);

    expect(rows[0]).toMatchObject({ drawProbability: 1 });
  });

  it("writes backtest rows, under the model, against each match's kickoff", () => {
    const later = played(9, 0, 0);
    const [row] = backtestRows([played(8, 1, 0), later], "home-baseline-v1", NOW);

    expect(row).toEqual({
      source: "taso",
      providerMatchId: later.providerMatchId,
      competitionCode: "VL",
      model: "home-baseline-v1",
      kind: "backtest",
      homeProbability: 1,
      drawProbability: 0,
      awayProbability: 0,
      predictedAt: NOW,
      kickoffAt: later.kickoffAt,
    });
  });
});
