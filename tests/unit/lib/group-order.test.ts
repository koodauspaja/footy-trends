import { describe, expect, it } from "vitest";
import { cupGroupOrder, leagueGroupOrder } from "@/lib/group-order";

type Kind = "own-calculated" | "pass-through" | "match-list";

const group = (groupId: number, kind: Kind = "own-calculated") => ({ groupId, kind });
const played = (groupId: number, day: string) => ({
  groupId,
  kickoffAt: new Date(`${day}T15:00:00Z`),
});
const ids = (groups: { groupId: number }[]) => groups.map((entry) => entry.groupId);

describe("leagueGroupOrder", () => {
  it("puts a split league's later groups first, in TASO's order, and its first phase last", () => {
    // VL 2025: Runkosarja, then Mestaruussarja and Karsintasarja from 13.9.
    const matches = [
      played(1, "2025-04-05"),
      played(1, "2025-08-31"),
      played(2, "2025-09-13"),
      played(2, "2025-11-09"),
      played(3, "2025-09-13"),
      played(3, "2025-10-18"),
    ];

    expect(ids(leagueGroupOrder([group(1), group(2), group(3)], matches))).toEqual([2, 3, 1]);
  });

  it("moves every group of a first phase played side by side", () => {
    // M2 2026: Lohko A to C, then the upper and lower groups.
    const matches = [
      ...[1, 2, 3].flatMap((id) => [played(id, "2026-04-17"), played(id, "2026-08-22")]),
      ...[4, 5, 6].flatMap((id) => [played(id, "2026-08-28"), played(id, "2026-09-19")]),
      ...[7, 8, 9].flatMap((id) => [played(id, "2026-09-04"), played(id, "2026-10-10")]),
    ];
    const groups = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => group(id));

    expect(ids(leagueGroupOrder(groups, matches))).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3]);
  });

  it("leaves a season with one phase as it is", () => {
    const matches = [played(1, "2026-04-02"), played(1, "2026-08-29")];

    expect(ids(leagueGroupOrder([group(1)], matches))).toEqual([1]);
  });

  it("leaves groups played at the same time in TASO's order", () => {
    const matches = [
      played(1, "2026-04-01"),
      played(1, "2026-06-01"),
      played(2, "2026-05-01"),
      played(2, "2026-07-01"),
    ];

    expect(ids(leagueGroupOrder([group(1), group(2)], matches))).toEqual([1, 2]);
  });

  it("puts the match lists after the tables, in TASO's order", () => {
    // VL 2019: Runkosarja, Mestaruussarja, Haastajasarja, then two knockout lists.
    const matches = [
      played(1, "2019-04-03"),
      played(1, "2019-09-01"),
      played(2, "2019-09-15"),
      played(3, "2019-09-13"),
      played(4, "2019-10-23"),
      played(5, "2019-10-30"),
    ];
    const groups = [group(1), group(2), group(3), group(4, "match-list"), group(5, "match-list")];

    expect(ids(leagueGroupOrder(groups, matches))).toEqual([2, 3, 1, 4, 5]);
  });

  it("keeps a group with no dated match with the groups it sits among", () => {
    const matches = [played(1, "2026-04-01"), played(1, "2026-08-01"), played(3, "2026-09-01")];

    expect(ids(leagueGroupOrder([group(1), group(2), group(3)], matches))).toEqual([3, 1, 2]);
  });

  it("keeps an undated first group in the first phase", () => {
    const matches = [played(2, "2026-04-01"), played(2, "2026-08-01"), played(3, "2026-09-01")];

    expect(ids(leagueGroupOrder([group(1), group(2), group(3)], matches))).toEqual([3, 1, 2]);
  });
});

describe("cupGroupOrder", () => {
  it("puts a cup's rounds latest first", () => {
    const rounds = [1, 2, 3].map((id) => group(id, "match-list"));

    expect(ids(cupGroupOrder(rounds))).toEqual([3, 2, 1]);
  });

  it("puts a group-stage cup's knockout before its group tables, which keep TASO's order", () => {
    // MSC 2021: league-named groups, then Cup-vaihe.
    const groups = [group(1, "pass-through"), group(2, "pass-through"), group(3, "match-list")];

    expect(ids(cupGroupOrder(groups))).toEqual([3, 1, 2]);
  });
});
