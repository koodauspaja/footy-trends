import { describe, expect, it } from "vitest";
import {
  type DiffableGroupTeam,
  diffGroupTeams,
  diffMatches,
  snapshotHash,
} from "@/lib/refresh-diff";

/**
 * The pure half of the forced refresh, from specs/029-forced-season-refresh.md.
 *
 * What this module answers is what an admin is shown in the confirmation
 * dialog *and* what the run log records, so a wrong answer here is both a
 * misleading prompt and a false audit trail. No database and no provider are
 * involved — these are rows in, counts out.
 */

const KICKOFF = new Date("2026-05-01T16:00:00.000Z");

function storedMatch(overrides: Partial<StoredMatch> = {}): StoredMatch {
  return {
    providerMatchId: 1,
    kickoffAt: KICKOFF,
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    status: "FINISHED",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

type StoredMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

/** The provider row carries only the columns the upsert writes. */
function providerMatch(overrides: Partial<Omit<StoredMatch, never>> = {}) {
  return {
    providerMatchId: 1,
    kickoffAt: KICKOFF,
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    status: "FINISHED",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

function groupTeam(overrides: Partial<DiffableGroupTeam> = {}): DiffableGroupTeam {
  return {
    groupId: 1,
    teamProviderId: 10,
    teamName: "HJK",
    startingPoints: 0,
    ...overrides,
  };
}

describe("diffMatches", () => {
  it("counts a match the provider has and we do not as inserted", () => {
    const diff = diffMatches([], [providerMatch()]);

    expect(diff.counts).toEqual({ inserted: 1, updated: 0, deleted: 0 });
    expect(diff.removed).toEqual([]);
  });

  it("counts an identical match as neither inserted nor updated", () => {
    const diff = diffMatches([storedMatch()], [providerMatch()]);

    expect(diff.counts).toEqual({ inserted: 0, updated: 0, deleted: 0 });
  });

  it("treats equal kickoff times as unchanged even though the Date objects differ", () => {
    // Without the Date case in `valuesDiffer` every match reads as changed on
    // every run, which would make the confirmation dialog worthless.
    const diff = diffMatches(
      [storedMatch({ kickoffAt: new Date(KICKOFF.getTime()) })],
      [providerMatch({ kickoffAt: new Date(KICKOFF.getTime()) })]
    );

    expect(diff.counts.updated).toBe(0);
  });

  it("counts a value that gained or lost a date as changed", () => {
    // One side a Date and the other not — a column that was null and now
    // carries a time, or the reverse. Without its own case this compares a
    // Date object against null by identity, which happens to be right here and
    // would not be if either side were ever a string.
    const diff = diffMatches(
      [storedMatch({ kickoffAt: null as unknown as Date })],
      [providerMatch()]
    );

    expect(diff.counts.updated).toBe(1);
  });

  it("counts a changed kickoff time as updated", () => {
    const diff = diffMatches(
      [storedMatch()],
      [providerMatch({ kickoffAt: new Date("2026-05-02T16:00:00.000Z") })]
    );

    expect(diff.counts).toEqual({ inserted: 0, updated: 1, deleted: 0 });
  });

  it.each([
    ["status", { status: "POSTPONED" }],
    ["homeGoals", { homeGoals: 3 }],
    ["awayGoals", { awayGoals: null }],
    ["homeTeamName", { homeTeamName: "HJK Helsinki" }],
  ])("counts a changed %s as updated", (_column, change) => {
    const diff = diffMatches([storedMatch()], [providerMatch(change)]);

    expect(diff.counts.updated).toBe(1);
  });

  it("names a stored match the provider no longer returns", () => {
    const diff = diffMatches([storedMatch({ providerMatchId: 7 })], []);

    expect(diff.counts).toEqual({ inserted: 0, updated: 0, deleted: 1 });
    expect(diff.removed).toEqual([
      {
        providerMatchId: 7,
        kickoffAt: KICKOFF.toISOString(),
        homeTeamName: "HJK",
        awayTeamName: "KuPS",
      },
    ]);
  });

  it("orders removals by provider id, so the confirmation reads the same twice", () => {
    const diff = diffMatches(
      [
        storedMatch({ providerMatchId: 9 }),
        storedMatch({ providerMatchId: 3 }),
        storedMatch({ providerMatchId: 5 }),
      ],
      []
    );

    expect(diff.removed.map((match) => match.providerMatchId)).toEqual([3, 5, 9]);
  });

  it("separates all three buckets in one answer", () => {
    const diff = diffMatches(
      [storedMatch({ providerMatchId: 1 }), storedMatch({ providerMatchId: 2 })],
      [providerMatch({ providerMatchId: 1, homeGoals: 4 }), providerMatch({ providerMatchId: 3 })]
    );

    expect(diff.counts).toEqual({ inserted: 1, updated: 1, deleted: 1 });
  });
});

describe("diffGroupTeams", () => {
  it("keys on the group and the team together", () => {
    // The same team id in two groups is two rows, matching
    // `taso_group_teams_identity_idx`. Keying on the team alone would report
    // one of them as a change to the other.
    const diff = diffGroupTeams(
      [groupTeam({ groupId: 1 }), groupTeam({ groupId: 2 })],
      [groupTeam({ groupId: 1 }), groupTeam({ groupId: 2 })]
    );

    expect(diff.counts).toEqual({ inserted: 0, updated: 0, deleted: 0 });
  });

  it("reports a moved starting_points as a deduction change", () => {
    const diff = diffGroupTeams(
      [groupTeam({ startingPoints: 0 })],
      [groupTeam({ startingPoints: -6 })]
    );

    expect(diff.deductionChanges).toEqual([{ teamName: "HJK", from: 0, to: -6 }]);
    expect(diff.counts.updated).toBe(1);
  });

  it("reports a deduction appearing where none was stored", () => {
    const diff = diffGroupTeams(
      [groupTeam({ startingPoints: null })],
      [groupTeam({ startingPoints: -3 })]
    );

    expect(diff.deductionChanges).toEqual([{ teamName: "HJK", from: null, to: -3 }]);
  });

  it("does not report an unchanged deduction", () => {
    const diff = diffGroupTeams(
      [groupTeam({ startingPoints: -6 })],
      [groupTeam({ startingPoints: -6 })]
    );

    expect(diff.deductionChanges).toEqual([]);
  });

  it("does not call a brand-new team a deduction change", () => {
    const diff = diffGroupTeams([], [groupTeam({ startingPoints: -6 })]);

    expect(diff.counts.inserted).toBe(1);
    expect(diff.deductionChanges).toEqual([]);
  });

  it("does not call a team the provider stopped returning a deduction change", () => {
    const diff = diffGroupTeams([groupTeam({ startingPoints: -6 })], []);

    expect(diff.counts.deleted).toBe(1);
    expect(diff.deductionChanges).toEqual([]);
  });
});

describe("snapshotHash", () => {
  it("ignores row order", () => {
    // The provider is under no obligation to keep an order, and a hash that
    // depended on one would refuse every apply for no reason.
    const rows = [providerMatch({ providerMatchId: 1 }), providerMatch({ providerMatchId: 2 })];

    expect(snapshotHash([rows])).toBe(snapshotHash([[...rows].reverse()]));
  });

  it("ignores key order within a row", () => {
    expect(snapshotHash([[{ a: 1, b: 2 }]])).toBe(snapshotHash([[{ b: 2, a: 1 }]]));
  });

  it("changes when any value changes", () => {
    expect(snapshotHash([[providerMatch()]])).not.toBe(
      snapshotHash([[providerMatch({ homeGoals: 3 })]])
    );
  });

  it("changes when a date changes", () => {
    expect(snapshotHash([[providerMatch()]])).not.toBe(
      snapshotHash([[providerMatch({ kickoffAt: new Date("2026-05-02T16:00:00.000Z") })]])
    );
  });

  it("canonicalises inside an array, not only at the top level", () => {
    // `canonical` is a general serialiser: an array value inside a row must
    // have its objects key-sorted too, or two equal rows could hash apart.
    expect(snapshotHash([[{ list: [{ a: 1, b: 2 }] }]])).toBe(
      snapshotHash([[{ list: [{ b: 2, a: 1 }] }]])
    );
    expect(snapshotHash([[{ list: [1, 2] }]])).not.toBe(snapshotHash([[{ list: [2, 1] }]]));
  });

  it("distinguishes the groups, so matches and group teams cannot be swapped", () => {
    const rows = [{ a: 1 }];

    expect(snapshotHash([rows, []])).not.toBe(snapshotHash([[], rows]));
  });

  it("distinguishes a row count change that leaves the rows identical", () => {
    const row = { a: 1 };

    expect(snapshotHash([[row]])).not.toBe(snapshotHash([[row, row]]));
  });
});
