import { describe, expect, it } from "vitest";
import { upcomingFirst } from "@/lib/match-order";

const match = (id: number, day: string, goals: [number, number] | null) => ({
  id,
  kickoffAt: new Date(`${day}T15:00:00Z`),
  homeGoals: goals?.[0] ?? null,
  awayGoals: goals?.[1] ?? null,
});

describe("upcomingFirst", () => {
  it("lists the matches to play nearest first, then the played ones newest first", () => {
    const matches = [
      match(1, "2026-04-01", [1, 0]),
      match(2, "2026-04-08", [2, 2]),
      match(3, "2026-04-15", null),
      match(4, "2026-04-22", null),
    ];

    expect(upcomingFirst(matches).map((entry) => entry.id)).toEqual([3, 4, 2, 1]);
  });

  it("counts a match with only one side's goals as not played", () => {
    const matches = [
      match(1, "2026-04-01", [1, 0]),
      { ...match(2, "2026-04-08", null), homeGoals: 1 },
    ];

    expect(upcomingFirst(matches).map((entry) => entry.id)).toEqual([2, 1]);
  });

  it("puts a past match with no score among the ones to play", () => {
    // A postponed match keeps its old kickoff and has no score yet.
    const matches = [match(1, "2026-04-01", null), match(2, "2026-04-08", [0, 0])];

    expect(upcomingFirst(matches).map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("does not reorder the list it is given", () => {
    const matches = [match(1, "2026-04-01", [1, 0]), match(2, "2026-04-08", null)];

    upcomingFirst(matches);

    expect(matches.map((entry) => entry.id)).toEqual([1, 2]);
  });
});
