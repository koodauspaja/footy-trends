import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { refreshRuns, tasoGroupTeams, tasoMatches, user } from "@/db/schema";
import type { NormalizedTasoGroupTeam, NormalizedTasoMatch } from "@/lib/taso";

/**
 * The forced refresh against a real Postgres, from
 * specs/029-forced-season-refresh.md.
 *
 * Everything here exists to prove one rule, and the rule is about deletion:
 *
 * > A provider that goes silent must never cost us data.
 *
 * The unit suite can show that a writer was not *called*. Only a real database
 * can show that the rows are still *there* — which is the claim that matters,
 * and the one that breaks if anyone later swaps the writer or widens the
 * delete's predicate. A mocked `where` cannot tell a delete scoped to two ids
 * from a delete scoped to a whole season.
 *
 * Only the provider's HTTP layer, Redis and season discovery are stubbed. The
 * writers, the transaction and the log are the real ones.
 */

const SEASON = 2016;
const COMPETITION_ID = "spljp16";
const CATEGORY_ID = "VL";
const CHOICE = { source: "taso", code: "VL" } as const;
const ADMIN_ID = "refresh-integration-admin";

const { state } = vi.hoisted(() => ({
  state: {
    providerMatches: [] as unknown[],
    providerGroupTeams: [] as unknown[],
    matchesThrows: false,
    groupsThrows: false,
    groupWriteThrows: false,
  },
}));

vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(),
  // No Redis in the integration job; the clearing itself is unit-tested.
  invalidateCache: vi.fn(async () => true),
}));

vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return {
    ...actual,
    getSeasonMatches: vi.fn(async () => {
      if (state.matchesThrows) throw new Error("TASO unavailable");
      return state.providerMatches;
    }),
    getSeasonGroups: vi.fn(async () => {
      if (state.groupsThrows) throw new Error("TASO unavailable");
      return [];
    }),
    normalizeGroupTeams: vi.fn(() => state.providerGroupTeams),
  };
});

vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return {
    ...actual,
    // Fixed, so the season range does not depend on TASO being reachable. The
    // writers below are deliberately *not* stubbed.
    resolveTasoSeasonContext: vi.fn(async () => ({
      currentSeason: 2026,
      defaultSeason: 2026,
    })),
    // The real writer, unless a test asks it to fail — which is how the
    // transaction's rollback is proven without a second write path.
    synchronizeGroupTeams: vi.fn(
      async (...args: Parameters<typeof actual.synchronizeGroupTeams>) => {
        if (state.groupWriteThrows) throw new Error("group write failed");
        return await actual.synchronizeGroupTeams(...args);
      }
    ),
  };
});

function buildMatch(overrides: Partial<NormalizedTasoMatch> = {}): NormalizedTasoMatch {
  return {
    providerMatchId: 960001,
    competitionCode: COMPETITION_ID,
    categoryId: CATEGORY_ID,
    seasonId: SEASON,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2016-08-01T15:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 96001,
    homeTeamName: "Refresh United",
    awayTeamProviderId: 96002,
    awayTeamName: "Refresh City",
    homeGoals: 2,
    awayGoals: 1,
    winner: null,
    ...overrides,
  };
}

function buildGroupTeam(overrides: Partial<NormalizedTasoGroupTeam> = {}): NormalizedTasoGroupTeam {
  return {
    categoryId: CATEGORY_ID,
    competitionCode: COMPETITION_ID,
    seasonId: SEASON,
    groupId: 1,
    teamProviderId: 96001,
    teamName: "Refresh United",
    startingPoints: 0,
    points: 10,
    played: 5,
    won: 3,
    drawn: 1,
    lost: 1,
    goalsFor: 9,
    goalsAgainst: 4,
    goalDifference: 5,
    currentStanding: 1,
    finalGroupStanding: 1,
    ...overrides,
  };
}

const seasonScope = and(
  eq(tasoMatches.competitionCode, COMPETITION_ID),
  eq(tasoMatches.seasonId, SEASON)
);

async function storedMatches() {
  return await db.select().from(tasoMatches).where(seasonScope);
}

async function storedGroupTeams() {
  return await db
    .select()
    .from(tasoGroupTeams)
    .where(
      and(eq(tasoGroupTeams.competitionCode, COMPETITION_ID), eq(tasoGroupTeams.seasonId, SEASON))
    );
}

async function seed(matches: NormalizedTasoMatch[], groupTeams: NormalizedTasoGroupTeam[]) {
  if (matches.length > 0) await db.insert(tasoMatches).values(matches);
  if (groupTeams.length > 0) await db.insert(tasoGroupTeams).values(groupTeams);
}

async function clearFixtures() {
  await db.delete(tasoMatches).where(seasonScope);
  await db
    .delete(tasoGroupTeams)
    .where(
      and(eq(tasoGroupTeams.competitionCode, COMPETITION_ID), eq(tasoGroupTeams.seasonId, SEASON))
    );
  await db.delete(refreshRuns).where(eq(refreshRuns.competitionCode, "VL"));
  await db.delete(user).where(eq(user.id, ADMIN_ID));
}

beforeEach(async () => {
  state.providerMatches = [];
  state.providerGroupTeams = [];
  state.matchesThrows = false;
  state.groupsThrows = false;
  state.groupWriteThrows = false;
  await clearFixtures();
  // Deliberately left at the default role. `run_by` is a foreign key and
  // nothing here reads a role — `requireAdmin()` guards the action layer, not
  // this one — and seeding a second admin would change the global admin count
  // that `admin.test.ts`'s last-admin guard is asserting on.
  await db.insert(user).values({
    id: ADMIN_ID,
    name: "Refresh Admin",
    email: "refresh-admin@example.fi",
    emailVerified: true,
  });
});

afterEach(async () => {
  await clearFixtures();
  vi.clearAllMocks();
});

async function preview() {
  const { previewRefresh } = await import("@/lib/force-refresh");
  return await previewRefresh(CHOICE, SEASON);
}

async function apply(hash: string) {
  const { applyRefresh } = await import("@/lib/force-refresh");
  return await applyRefresh(CHOICE, SEASON, hash, ADMIN_ID);
}

describe("a preview", () => {
  it("leaves every stored row exactly as it was", async () => {
    await seed([buildMatch()], [buildGroupTeam()]);
    const before = await storedMatches();
    const groupsBefore = await storedGroupTeams();

    // A provider answer that differs in every way it can.
    state.providerMatches = [buildMatch({ homeGoals: 5, status: "POSTPONED" })];
    state.providerGroupTeams = [buildGroupTeam({ startingPoints: -6 })];

    const result = await preview();

    expect(result.ok).toBe(true);
    // Row for row, including `updated_at` — a preview that touched the table
    // would move it even if the values matched.
    expect(await storedMatches()).toEqual(before);
    expect(await storedGroupTeams()).toEqual(groupsBefore);
  });

  it("writes no run row, because nothing happened to the data", async () => {
    await seed([buildMatch()], []);
    state.providerMatches = [buildMatch({ homeGoals: 5 })];

    await preview();

    expect(await db.select().from(refreshRuns)).toEqual([]);
  });
});

describe("a provider that goes silent", () => {
  it("keeps every stored match when the answer is empty", async () => {
    await seed([buildMatch(), buildMatch({ providerMatchId: 960002 })], []);

    const result = await preview();

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    expect(await storedMatches()).toHaveLength(2);
  });

  it("keeps every stored group row when the answer is empty", async () => {
    // The sharp case. `synchronizeGroupTeams` deletes before inserting, which
    // is right for the current season and would destroy a completed one here.
    await seed([], [buildGroupTeam(), buildGroupTeam({ teamProviderId: 96002 })]);

    const result = await preview();

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    expect(await storedGroupTeams()).toHaveLength(2);
  });

  it("keeps the stored standings when TASO returns matches but no groups", async () => {
    // The asymmetric case review found. The earlier version of this guard was
    // an `&&` across both tables, so this answer walked past it and
    // `synchronizeGroupTeams` — which deletes before inserting — destroyed the
    // season's standings while the run reported success.
    await seed([buildMatch()], [buildGroupTeam(), buildGroupTeam({ teamProviderId: 96002 })]);
    state.providerMatches = [buildMatch({ homeGoals: 9 })];
    state.providerGroupTeams = [];

    const result = await preview();

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    expect(await storedGroupTeams()).toHaveLength(2);
    expect((await storedMatches())[0]?.homeGoals).toBe(2);
  });

  it("keeps the stored matches when TASO returns groups but no matches", async () => {
    await seed([buildMatch(), buildMatch({ providerMatchId: 960002 })], [buildGroupTeam()]);
    state.providerMatches = [];
    state.providerGroupTeams = [buildGroupTeam({ startingPoints: -6 })];

    const result = await preview();

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    expect(await storedMatches()).toHaveLength(2);
  });

  it("keeps everything when the provider throws, and records the run", async () => {
    await seed([buildMatch()], [buildGroupTeam()]);
    state.matchesThrows = true;

    const result = await apply("any-hash");

    expect(result).toEqual({ ok: false, reason: "provider" });
    expect(await storedMatches()).toHaveLength(1);
    expect(await storedGroupTeams()).toHaveLength(1);

    const [run] = await db.select().from(refreshRuns);
    expect(run).toMatchObject({ status: "failed", reason: "provider", runBy: ADMIN_ID });
  });

  it("keeps the previous group snapshot when only the group fetch fails", async () => {
    await seed([buildMatch()], [buildGroupTeam({ startingPoints: -3 })]);
    state.providerMatches = [buildMatch({ homeGoals: 4 })];
    state.groupsThrows = true;

    const result = await preview();

    expect(result).toEqual({ ok: false, reason: "provider" });
    const groups = await storedGroupTeams();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.startingPoints).toBe(-3);
    // And the matches were not written either — a failed preview is not half a
    // preview.
    expect((await storedMatches())[0]?.homeGoals).toBe(2);
  });
});

describe("an applied refresh", () => {
  it("lands the deduction the tool exists for", async () => {
    await seed([buildMatch()], [buildGroupTeam({ startingPoints: 0 })]);
    state.providerMatches = [buildMatch()];
    state.providerGroupTeams = [buildGroupTeam({ startingPoints: -6 })];

    const previewed = await preview();
    expect(previewed.ok).toBe(true);
    if (!previewed.ok) return;
    expect(previewed.preview.deductionChanges).toEqual([
      { teamName: "Refresh United", from: 0, to: -6 },
    ]);

    const result = await apply(previewed.preview.snapshotHash);

    expect(result.ok).toBe(true);
    expect((await storedGroupTeams())[0]?.startingPoints).toBe(-6);
  });

  it("removes only the matches the preview named, and nothing else in the season", async () => {
    // The assertion a mocked `where` cannot make: that the delete was scoped to
    // one id rather than to the season.
    await seed(
      [
        buildMatch({ providerMatchId: 960001 }),
        buildMatch({ providerMatchId: 960002 }),
        buildMatch({ providerMatchId: 960003 }),
      ],
      []
    );
    state.providerMatches = [
      buildMatch({ providerMatchId: 960001 }),
      buildMatch({ providerMatchId: 960003 }),
    ];

    const previewed = await preview();
    if (!previewed.ok) return;
    expect(previewed.preview.removedMatches.map((m) => m.providerMatchId)).toEqual([960002]);
    // Still all three until it is applied.
    expect(await storedMatches()).toHaveLength(3);

    await apply(previewed.preview.snapshotHash);

    expect((await storedMatches()).map((m) => m.providerMatchId).sort()).toEqual([960001, 960003]);
  });

  it("records the counts the preview showed", async () => {
    await seed(
      [buildMatch({ providerMatchId: 960001 }), buildMatch({ providerMatchId: 960002 })],
      [buildGroupTeam({ startingPoints: 0 })]
    );
    state.providerMatches = [
      buildMatch({ providerMatchId: 960001, homeGoals: 7 }),
      buildMatch({ providerMatchId: 960004 }),
    ];
    state.providerGroupTeams = [buildGroupTeam({ startingPoints: -6 })];

    const previewed = await preview();
    if (!previewed.ok) return;
    await apply(previewed.preview.snapshotHash);

    const [run] = await db.select().from(refreshRuns);
    expect(run).toMatchObject({
      status: "success",
      matchesInserted: 1,
      matchesUpdated: 1,
      matchesDeleted: 1,
      deductionsChanged: 1,
      runBy: ADMIN_ID,
    });
    expect(run?.matchesInserted).toBe(previewed.preview.matches.inserted);
    expect(run?.matchesUpdated).toBe(previewed.preview.matches.updated);
    expect(run?.matchesDeleted).toBe(previewed.preview.matches.deleted);
  });

  it("refuses when the provider's answer moved after the preview", async () => {
    await seed([buildMatch()], []);
    state.providerMatches = [buildMatch({ homeGoals: 4 })];

    const previewed = await preview();
    if (!previewed.ok) return;

    state.providerMatches = [buildMatch({ homeGoals: 9 })];
    const result = await apply(previewed.preview.snapshotHash);

    expect(result).toMatchObject({ ok: false, reason: "stale" });
    // Untouched: 2 is what was seeded, and neither 4 nor 9 was approved.
    expect((await storedMatches())[0]?.homeGoals).toBe(2);
  });
});

describe("one transaction", () => {
  it("rolls the match write back when the group write fails", async () => {
    // Proves the writers actually join the transaction `writeSnapshot` opens.
    // They used to take the module-level `db`, so the match upsert committed on
    // its own connection and this assertion would have found homeGoals 9.
    await seed([buildMatch()], [buildGroupTeam()]);
    state.providerMatches = [buildMatch({ homeGoals: 9 })];
    state.providerGroupTeams = [buildGroupTeam({ startingPoints: -6 })];

    const previewed = await preview();
    if (!previewed.ok) return;

    state.groupWriteThrows = true;
    const result = await apply(previewed.preview.snapshotHash);

    expect(result).toEqual({ ok: false, reason: "write" });
    // Neither half landed.
    expect((await storedMatches())[0]?.homeGoals).toBe(2);
    expect((await storedGroupTeams())[0]?.startingPoints).toBe(0);
  });
});

describe("knockout duplicates", () => {
  it("counts a repeated bracket slot once, matching what is stored", async () => {
    await seed([buildMatch()], []);
    state.providerMatches = [buildMatch()];
    // A team that advances appears once per slot it occupies.
    state.providerGroupTeams = [
      buildGroupTeam(),
      buildGroupTeam(),
      buildGroupTeam({ teamProviderId: 96002 }),
    ];

    const previewed = await preview();
    if (!previewed.ok) return;
    expect(previewed.preview.groupRows?.inserted).toBe(2);

    await apply(previewed.preview.snapshotHash);

    // The promise and the outcome agree, which is the point.
    expect(await storedGroupTeams()).toHaveLength(2);
  });
});

describe("the run log", () => {
  it("outlives the admin who ran it, without naming them", async () => {
    // `run_by` is `on delete set null`, the one deliberate exception to the
    // cascade that `decisions/028-admin-tools-and-roles.md` relies on.
    await seed([buildMatch()], []);
    state.providerMatches = [buildMatch({ homeGoals: 4 })];

    const previewed = await preview();
    if (!previewed.ok) return;
    await apply(previewed.preview.snapshotHash);

    await db.delete(user).where(eq(user.id, ADMIN_ID));

    const runs = await db.select().from(refreshRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runBy).toBeNull();
    expect(runs[0]?.matchesUpdated).toBe(1);
  });

  it("reads back through listRuns with the operator resolved", async () => {
    await seed([buildMatch()], []);
    state.providerMatches = [buildMatch({ homeGoals: 4 })];

    const previewed = await preview();
    if (!previewed.ok) return;
    await apply(previewed.preview.snapshotHash);

    const { listRuns } = await import("@/lib/refresh-runs");
    const rows = (await listRuns()).filter((row) => row.competitionName === "Veikkausliiga");

    expect(rows[0]).toMatchObject({
      succeeded: true,
      runByName: "Refresh Admin",
      seasonLabel: String(SEASON),
    });
  });
});

describe("cleanup", () => {
  it("leaves no fixture rows behind", async () => {
    const leftovers = await db
      .select()
      .from(tasoMatches)
      .where(inArray(tasoMatches.providerMatchId, [960001, 960002, 960003, 960004]));

    expect(leftovers).toEqual([]);
  });
});
