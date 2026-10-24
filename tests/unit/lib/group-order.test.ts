import { describe, expect, it } from "vitest";
import { cupGroupOrder, leagueGroupOrder, openCupGroups } from "@/lib/group-order";

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
  const list = (groupId: number) => group(groupId, "match-list");

  it("puts a knockout's rounds latest first", () => {
    const matches = [played(1, "2025-04-01"), played(2, "2025-05-01"), played(3, "2025-06-01")];

    expect(ids(cupGroupOrder([list(1), list(2), list(3)], matches))).toEqual([3, 2, 1]);
  });

  it("puts rounds that overlap latest first all the same", () => {
    // MSC 2025: Kierros 1 starts while Juuson kierros is still being played.
    const matches = [
      played(1, "2025-02-09"),
      played(1, "2025-03-09"),
      played(2, "2025-02-15"),
      played(2, "2025-03-24"),
      played(3, "2025-03-22"),
    ];

    expect(ids(cupGroupOrder([list(1), list(2), list(3)], matches))).toEqual([3, 2, 1]);
  });

  it("keeps a group stage starting on one day in TASO's order, after the round that follows it", () => {
    // MSC 2021: six groups from 6.2., then Cup-vaihe from 6.3.
    const matches = [
      played(1, "2021-02-06"),
      played(1, "2021-03-04"),
      played(2, "2021-02-06"),
      played(2, "2021-02-21"),
      played(3, "2021-03-06"),
    ];

    expect(ids(cupGroupOrder([list(1), list(2), list(3)], matches))).toEqual([3, 1, 2]);
  });

  it("puts any group tables after the match lists, in TASO's order", () => {
    const groups = [group(1, "pass-through"), group(2, "pass-through"), list(3)];

    expect(ids(cupGroupOrder(groups, [played(3, "2021-05-01")]))).toEqual([3, 1, 2]);
  });

  it("reads a round's first day in Helsinki, as the date column does", () => {
    // 23.30 UTC on 1.4. is already 2.4. in Helsinki, the day round 2 starts:
    // the two start on one day there, so TASO's order holds.
    const matches = [
      { groupId: 1, kickoffAt: new Date("2025-04-01T23:30:00Z") },
      { groupId: 2, kickoffAt: new Date("2025-04-02T15:00:00Z") },
    ];

    expect(ids(cupGroupOrder([list(1), list(2)], matches))).toEqual([1, 2]);
  });

  it("puts an undated round after the dated ones", () => {
    const matches = [played(1, "2025-04-01"), played(3, "2025-06-01")];

    expect(ids(cupGroupOrder([list(1), list(2), list(3)], matches))).toEqual([3, 1, 2]);
  });
});

describe("openCupGroups", () => {
  const list = (groupId: number) => group(groupId, "match-list");
  const open = (
    groups: { groupId: number; kind: string }[],
    matches: { groupId: number; kickoffAt: Date }[]
  ) => [...openCupGroups(groups, matches)];

  it("opens a knockout's latest round alone", () => {
    // MSC 2025: Loppuottelu open, Juuson kierros and the eight rounds after it closed.
    const matches = [played(1, "2025-02-09"), played(2, "2025-03-22"), played(3, "2025-09-20")];

    expect(open([list(1), list(2), list(3)], matches)).toEqual([3]);
  });

  it("opens the rounds that start on the latest round's day together", () => {
    // NSC 2015: Pikkufinaali at 15.15 and Finaali at 18.05 on 2.6.
    const matches = [
      played(1, "2015-05-05"),
      { groupId: 2, kickoffAt: new Date("2015-06-02T12:15:00Z") },
      { groupId: 3, kickoffAt: new Date("2015-06-02T15:05:00Z") },
    ];

    expect(open([list(1), list(2), list(3)], matches)).toEqual([2, 3]);
  });

  it("reads the latest round by its first day, not by its last", () => {
    // A round still being played when the next one starts is the earlier one.
    const matches = [played(1, "2025-02-09"), played(1, "2025-04-01"), played(2, "2025-03-22")];

    expect(open([list(1), list(2)], matches)).toEqual([2]);
  });

  it("opens every round when none is dated, as the page did before", () => {
    expect(open([list(1), list(2)], [])).toEqual([1, 2]);
  });

  it("keeps an undated round closed beside a dated one", () => {
    expect(open([list(1), list(2)], [played(2, "2025-06-01")])).toEqual([2]);
  });
});
