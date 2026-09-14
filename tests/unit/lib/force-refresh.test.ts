import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The forced refresh engine, from specs/029-forced-season-refresh.md.
 *
 * Two assertions here carry the feature's safety rule and everything else is
 * detail around them:
 *
 * 1. **A preview calls no writer**, whatever the provider answered.
 * 2. **An empty provider answer, for a season we hold rows for, calls no
 *    writer either** — a provider going silent must never cost us data.
 *
 * No real database: the CI unit job has no service containers, deliberately.
 * The writers are mocked and their call counts asserted, so "wrote nothing"
 * is checked rather than inferred from a return value.
 */
const { state, logger } = vi.hoisted(() => ({
  state: {
    storedMatches: [] as Record<string, unknown>[],
    storedGroupTeams: [] as Record<string, unknown>[],
    providerMatches: [] as Record<string, unknown>[],
    providerGroups: [] as unknown[],
    normalizedGroupTeams: [] as Record<string, unknown>[],
    invalidated: [] as string[],
    invalidateSucceeds: true,
    matchesThrows: false,
    groupsThrows: false,
    deleteCalls: 0,
    transactions: 0,
    lastTx: null as unknown,
    transactionThrows: false,
    seasonListThrows: false,
    /** The read that lists which seasons are stored. */
    seasonReadThrows: false,
    /** The read of the season's own rows, inside the diff. */
    storedReadThrows: false,
    /** The seasons the app holds rows for — the tool offers only these. */
    storedSeasons: [2026, 2025, 2024, 2016] as number[],
    /** Lets a test change what is stored *between* the check and the write. */
    storedMatchesAtWrite: null as Record<string, unknown>[] | null,
    storedGroupTeamsAtWrite: null as Record<string, unknown>[] | null,
  },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({ logger }));

vi.mock("@/lib/cache", () => ({
  invalidateCache: vi.fn(async (key: string) => {
    state.invalidated.push(key);
    return state.invalidateSucceeds;
  }),
}));

const synchronizeTasoMatches = vi.fn(async () => undefined);
const synchronizeGroupTeams = vi.fn(async () => undefined);
const synchronizeForeignMatches = vi.fn(async () => undefined);
const recordSuccess = vi.fn(async () => undefined);
const recordFailure = vi.fn(async () => undefined);
/** The probing resolver. Nothing in this engine may call it — it writes. */
const resolveTasoSeasonContext = vi.fn(async () => ({
  currentSeason: 2026,
  defaultSeason: 2026,
}));

vi.mock("@/lib/refresh-runs", () => ({ recordSuccess, recordFailure }));

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
      return state.providerGroups;
    }),
    normalizeGroupTeams: vi.fn(() => state.normalizedGroupTeams),
  };
});

vi.mock("@/lib/football-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/football-data")>();
  return {
    ...actual,
    getSeasonMatches: vi.fn(async () => {
      if (state.matchesThrows) throw new Error("provider unavailable");
      return state.providerMatches;
    }),
    getSeasonContext: vi.fn(async () => ({
      activeSeasonId: 2025,
      selectableSeasons: [
        { seasonId: 2025, label: "2025/26" },
        { seasonId: 2024, label: "2024/25" },
      ],
      spansCalendarYears: true,
    })),
  };
});

vi.mock("@/lib/standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/standings-service")>();
  return { ...actual, synchronizeMatches: synchronizeForeignMatches };
});

vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return {
    ...actual,
    resolveTasoSeasonContext,
    resolveTasoSeasonCeiling: vi.fn(async () => {
      if (state.seasonListThrows) throw new Error("TASO unavailable");
      return { currentSeason: 2026, newestStored: 2026 };
    }),
    synchronizeMatches: synchronizeTasoMatches,
    synchronizeGroupTeams,
  };
});

/** Drizzle stores a table's SQL name under this symbol. */
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function tableName(table: unknown): string {
  return String((table as Record<symbol, unknown>)?.[DRIZZLE_NAME] ?? "");
}

vi.mock("@/db", () => {
  // Told apart by which table the read is scoped to, the way
  // `admin-users.test.ts` tells its queries apart by shape.
  const tx = {
    // The write re-reads the stored rows through the transaction and recomputes
    // the approval hash, so the transaction has to answer reads too.
    select: () => ({
      from: (from: unknown) => ({
        where: async () =>
          tableName(from) === "taso_group_teams"
            ? (state.storedGroupTeamsAtWrite ?? state.storedGroupTeams)
            : (state.storedMatchesAtWrite ?? state.storedMatches),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deleteCalls += 1;
      },
    }),
  };
  return {
    db: {
      // The season list asks which seasons the app holds rows for.
      selectDistinct: () => ({
        from: () => ({
          where: async () => {
            if (state.seasonReadThrows) throw new Error("database unavailable");
            return state.storedSeasons.map((seasonId) => ({ seasonId }));
          },
        }),
      }),
      select: () => ({
        from: (from: unknown) => ({
          where: async () => {
            if (state.storedReadThrows) throw new Error("database unavailable");
            return tableName(from) === "taso_group_teams"
              ? state.storedGroupTeams
              : state.storedMatches;
          },
        }),
      }),
      transaction: async (run: (t: typeof tx) => Promise<boolean>) => {
        state.transactions += 1;
        state.lastTx = tx;
        if (state.transactionThrows) throw new Error("write failed");
        return await run(tx);
      },
    },
  };
});

const KICKOFF = new Date("2026-05-01T16:00:00.000Z");

function match(id: number, overrides: Record<string, unknown> = {}) {
  return {
    providerMatchId: id,
    kickoffAt: KICKOFF,
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    status: "FINISHED",
    ...overrides,
  };
}

function groupTeam(overrides: Record<string, unknown> = {}) {
  return { groupId: 1, teamProviderId: 10, teamName: "HJK", startingPoints: 0, ...overrides };
}

const VEIKKAUSLIIGA = { source: "taso", code: "VL" } as const;

beforeEach(() => {
  state.storedMatches = [];
  state.storedGroupTeams = [];
  state.providerMatches = [];
  state.providerGroups = [];
  state.normalizedGroupTeams = [];
  state.invalidated = [];
  state.invalidateSucceeds = true;
  state.matchesThrows = false;
  state.groupsThrows = false;
  state.deleteCalls = 0;
  state.transactions = 0;
  state.lastTx = null;
  state.transactionThrows = false;
  state.seasonListThrows = false;
  state.seasonReadThrows = false;
  state.storedReadThrows = false;
  state.storedSeasons = [2026, 2025, 2024, 2016];
  state.storedMatchesAtWrite = null;
  state.storedGroupTeamsAtWrite = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

function noWriterRan(): void {
  expect(synchronizeTasoMatches).not.toHaveBeenCalled();
  expect(synchronizeGroupTeams).not.toHaveBeenCalled();
  expect(synchronizeForeignMatches).not.toHaveBeenCalled();
  expect(state.transactions).toBe(0);
  expect(state.deleteCalls).toBe(0);
}

/**
 * Pays this module's transform once, in a hook rather than inside whichever
 * test happens to run first.
 *
 * `vi.resetModules()` clears module *instances* between tests but not Vite's
 * transform cache, so the first dynamic import of the subject costs real time
 * and every later one costs nothing. Left in the test body that one-off is
 * charged to an arbitrary test — under `--sequence.shuffle` a different one
 * each run — and under parallel load it can exhaust the whole budget. See #384.
 *
 * The rejection is swallowed because only the *transform* is wanted: a module
 * that refuses to construct without its environment — `@/lib/auth` does — is
 * still transformed before it throws, and the tests below import it themselves,
 * so a genuine failure surfaces there rather than being hidden here.
 */
beforeAll(async () => {
  await import("@/lib/force-refresh").catch(() => undefined);
  await import("@/lib/taso").catch(() => undefined);
});

describe("previewRefresh", () => {
  it("writes nothing, whatever the provider answered", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" }), match(2)];
    state.normalizedGroupTeams = [groupTeam({ startingPoints: -6 })];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result.ok).toBe(true);
    noWriterRan();
  });

  it("reports what would change without changing it", async () => {
    state.storedMatches = [match(1), match(9)];
    state.providerMatches = [match(1, { status: "POSTPONED" }), match(2)];
    state.storedGroupTeams = [groupTeam({ startingPoints: 0 })];
    state.normalizedGroupTeams = [groupTeam({ startingPoints: -6 })];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.matches).toEqual({ inserted: 1, updated: 1, deleted: 1 });
    expect(result.preview.removedMatches.map((m) => m.providerMatchId)).toEqual([9]);
    expect(result.preview.deductionChanges).toEqual([{ teamName: "HJK", from: 0, to: -6 }]);
    noWriterRan();
  });

  it("refuses an empty answer for a season we hold rows for, and writes nothing", async () => {
    state.storedMatches = [match(1), match(2)];
    state.storedGroupTeams = [groupTeam()];
    state.providerMatches = [];
    state.normalizedGroupTeams = [];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toEqual({ ok: false, reason: "empty", storedRows: 3 });
    noWriterRan();
  });

  it("refuses an empty foreign answer for a season we hold matches for", async () => {
    // The same rule as TASO, and it needs its own test: the foreign path has
    // its own diff and its own early return, so a mutation that removes one
    // leaves the other passing.
    state.storedMatches = [match(1), match(2)];
    state.providerMatches = [];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh({ source: "football-data", code: "PL" }, 2025);

    expect(result).toEqual({ ok: false, reason: "empty", storedRows: 2 });
    noWriterRan();
  });

  it("refuses when TASO returns matches but no group standings", async () => {
    // The hole review found. An `&&` across both tables walks straight past
    // this, and `synchronizeGroupTeams` deletes before it inserts — so a
    // completed season's standings would be destroyed by a run that reported
    // success.
    state.storedGroupTeams = [groupTeam()];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    noWriterRan();
  });

  it("refuses when TASO returns group standings but no matches", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [];
    state.normalizedGroupTeams = [groupTeam()];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toMatchObject({ ok: false, reason: "empty" });
    noWriterRan();
  });

  it("counts a knockout group's repeated team once, as the writer will store it", async () => {
    // A knockout group returns one row per bracket slot, so a team that
    // advances appears several times. `synchronizeGroupTeams` keeps the first
    // and drops the rest, so counting the raw rows would promise an admin more
    // inserts than the apply performs — and write that promise to the log.
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam(), groupTeam(), groupTeam({ teamProviderId: 20 })];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.groupRows?.inserted).toBe(2);
  });

  it("does not refuse an empty answer for a season we hold nothing for", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.matches).toEqual({ inserted: 0, updated: 0, deleted: 0 });
  });

  it("stops before fetching when a cache entry cannot be cleared", async () => {
    state.invalidateSucceeds = false;

    const taso = await import("@/lib/taso");
    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toEqual({ ok: false, reason: "cache" });
    expect(taso.getSeasonMatches).not.toHaveBeenCalled();
    expect(taso.getSeasonGroups).not.toHaveBeenCalled();
    noWriterRan();
  });

  it("clears both TASO entries for the season, and nothing else", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");
    await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(state.invalidated).toEqual(["taso:matches:spljp26:VL", "taso:category:spljp26:VL"]);
    // Which seasons and names exist is not what a refresh corrects.
    expect(state.invalidated).not.toContain("taso:season-context:VL");
    expect(state.invalidated).not.toContain("taso:categories:spljp26");
  });

  it("clears the foreign match entry and the computed standings entry", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");
    await previewRefresh({ source: "football-data", code: "PL" }, 2025);

    // The computed table is the one that is easy to miss: the write succeeds,
    // so leaving it serves the old standings after the data is already right.
    expect(state.invalidated).toEqual(["football-data:matches:PL:2025", "standings:PL:2025"]);
  });

  it("reports a provider failure as such and writes nothing", async () => {
    state.matchesThrows = true;

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toEqual({ ok: false, reason: "provider" });
    noWriterRan();
  });

  it("fails as a whole when the group fetch fails, rather than offering half a diff", async () => {
    state.groupsThrows = true;
    state.providerMatches = [match(1)];

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toEqual({ ok: false, reason: "provider" });
    noWriterRan();
  });

  it("refuses a competition this app does not have", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");

    expect(await previewRefresh({ source: "taso", code: "NOPE" }, 2026)).toEqual({
      ok: false,
      reason: "input",
    });
  });

  it("refuses a national-team competition, which the tool does not offer", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");

    // In the same registry as the foreign competitions, and deliberately not
    // offered: national teams have no standings depending on a deduction.
    expect(await previewRefresh({ source: "football-data", code: "WC" }, 2025)).toEqual({
      ok: false,
      reason: "input",
    });
  });

  it("refuses a season outside the competition's range", async () => {
    const { previewRefresh } = await import("@/lib/force-refresh");

    expect(await previewRefresh(VEIKKAUSLIIGA, 1999)).toEqual({ ok: false, reason: "input" });
  });

  it("asks TASO for the identifiers the page reads, including a cup's own prefix", async () => {
    const taso = await import("@/lib/taso");
    const { previewRefresh } = await import("@/lib/force-refresh");

    await previewRefresh(VEIKKAUSLIIGA, 2026);
    expect(taso.getSeasonMatches).toHaveBeenCalledWith("spljp26", "VL", 2026);

    vi.clearAllMocks();
    // Ykkösliigacup is its own competition rather than a category inside the
    // season umbrella. `competitionIdFromSeason` would answer `spljp26` and
    // write rows the cup page never reads.
    await previewRefresh({ source: "taso", code: "M1LCUP" }, 2026);
    expect(taso.getSeasonMatches).toHaveBeenCalledWith("M1LCUP26", "M1LCUP", 2026);
  });
});

describe("applyRefresh", () => {
  async function previewThenHash() {
    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);
    if (!result.ok) throw new Error("preview refused");
    return result.preview.snapshotHash;
  }

  it("writes the diff the preview showed", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" })];
    state.normalizedGroupTeams = [groupTeam()];

    const hash = await previewThenHash();
    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result.ok).toBe(true);
    expect(synchronizeTasoMatches).toHaveBeenCalledTimes(1);
    expect(synchronizeGroupTeams).toHaveBeenCalledTimes(1);
    expect(recordSuccess).toHaveBeenCalledTimes(1);
  });

  it("hands every writer the transaction, not the module-level database", async () => {
    // Without this the writers commit on their own connections while
    // `writeSnapshot` claims atomicity, so a group replacement can land and a
    // later deletion fail, leaving the season half applied.
    state.storedMatches = [match(1), match(7)];
    state.providerMatches = [match(1, { status: "POSTPONED" })];
    state.normalizedGroupTeams = [groupTeam()];

    const hash = await previewThenHash();
    const { applyRefresh } = await import("@/lib/force-refresh");
    await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(synchronizeTasoMatches).toHaveBeenCalledWith(expect.anything(), state.lastTx);
    expect(synchronizeGroupTeams).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2026,
      expect.anything(),
      state.lastTx
    );
  });

  it("deletes only when the preview listed a removal", async () => {
    // *Which* rows go is proven against a real Postgres in
    // `tests/integration/refresh.test.ts` — a mocked `where` cannot show that a
    // delete was scoped to two ids rather than to the whole season, and that is
    // the part worth proving.
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];

    const unchangedHash = await previewThenHash();
    const { applyRefresh } = await import("@/lib/force-refresh");
    await applyRefresh(VEIKKAUSLIIGA, 2026, unchangedHash, "admin-1");
    expect(state.deleteCalls).toBe(0);

    state.storedMatches = [match(1), match(7)];
    const withRemovalHash = await previewThenHash();
    await applyRefresh(VEIKKAUSLIIGA, 2026, withRemovalHash, "admin-1");
    expect(state.deleteCalls).toBe(1);
  });

  it("does not clear the cache again, so the apply reads what the preview saw", async () => {
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];

    const hash = await previewThenHash();
    state.invalidated = [];

    const { applyRefresh } = await import("@/lib/force-refresh");
    await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(state.invalidated).toEqual([]);
  });

  it("refuses and writes nothing when the provider's answer moved in between", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];
    const hash = await previewThenHash();

    // The provider now says something else than the admin approved.
    state.providerMatches = [match(1, { status: "POSTPONED" })];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("stale");
    // And it hands back the fresh diff, so the admin decides again rather than
    // being told to retry blind.
    expect(result.preview?.matches.updated).toBe(1);
    noWriterRan();
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  it("refuses when the stored rows moved, even though the provider's answer did not", async () => {
    // The approval is over *both* sides. Hashing only the provider would let
    // another admin's apply — or the ordinary sync on a current season — change
    // what we hold, and this apply would still accept an approval built against
    // rows that are gone, removing matches by name that nobody saw listed.
    state.storedMatches = [match(1), match(7)];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];
    const hash = await previewThenHash();

    // Same provider answer; somebody else already removed match 7.
    state.storedMatches = [match(1)];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result).toMatchObject({ ok: false, reason: "stale" });
    noWriterRan();
  });

  it("hands back a diff of the rows that are there now, not the ones that were", async () => {
    // Returning the caller's own preview here would show an admin a diff of
    // rows that no longer exist, and invite them to approve it a second time.
    state.storedMatches = [match(1), match(7)];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];
    const hash = await previewThenHash();

    // Somebody else removed match 7 between the check and the write, so there
    // is nothing left to delete.
    state.storedMatchesAtWrite = [match(1)];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("stale");
    // The approved diff removed one match; the honest one removes none.
    expect(result.preview?.matches.deleted).toBe(0);
    expect(result.preview?.removedMatches).toEqual([]);
  });

  it("writes nothing when the provider turns out to be silent on rows that appeared", async () => {
    // The snapshot is fetched once and reused by the write, so the provider
    // cannot change underneath it — but the *stored* side can. Group rows
    // appearing between the preview and the write turn an answer that was
    // merely empty into one that is silent about rows we now hold, and the
    // silence rule is absolute: nothing is written.
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" })];
    state.storedGroupTeams = [];
    state.normalizedGroupTeams = [];
    const hash = await previewThenHash();

    state.storedGroupTeamsAtWrite = [groupTeam()];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result).toMatchObject({ ok: false, reason: "stale" });
    // No diff to show: the run a fresh preview would describe is a refusal.
    expect(result.ok === false && result.preview).toBeUndefined();
    expect(synchronizeTasoMatches).not.toHaveBeenCalled();
    expect(synchronizeGroupTeams).not.toHaveBeenCalled();
  });

  it("writes nothing when the stored rows move after the approval is checked", async () => {
    // The check before the transaction reads rows outside it, so on its own it
    // is a time-of-check/time-of-use gap: another apply — or the ordinary sync
    // on a current season — could commit in between, and this apply would
    // overwrite them with an approval that no longer describes anything.
    state.storedMatches = [match(1), match(7)];
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];
    const hash = await previewThenHash();

    // Somebody else got there between the check and the write.
    state.storedMatchesAtWrite = [match(1)];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, hash, "admin-1");

    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(synchronizeTasoMatches).not.toHaveBeenCalled();
    expect(synchronizeGroupTeams).not.toHaveBeenCalled();
    expect(state.deleteCalls).toBe(0);
  });

  it("records a failed run when the provider goes silent on a season we hold", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [];
    state.normalizedGroupTeams = [];

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, "any-hash", "admin-1");

    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(recordFailure).toHaveBeenCalledWith(VEIKKAUSLIIGA, 2026, "empty", "admin-1", "2026");
    noWriterRan();
  });

  it("does not record a run for a stale bounce", async () => {
    state.providerMatches = [match(1)];
    state.normalizedGroupTeams = [groupTeam()];
    await previewThenHash();

    const { applyRefresh } = await import("@/lib/force-refresh");
    await applyRefresh(VEIKKAUSLIIGA, 2026, "a-hash-from-nowhere", "admin-1");

    // The apply working as intended is not a failure to log.
    expect(recordFailure).not.toHaveBeenCalled();
  });
});

describe("listSeasonsFor", () => {
  it("never calls the resolver that probes by synchronizing", async () => {
    // `resolveTasoSeasonContext` decides its default season by *syncing* the
    // current one, which writes. Reaching for it here would mean a preview
    // mutated current-season rows before an admin approved anything — the one
    // thing this engine promises not to do.
    const { listSeasonsFor, previewRefresh } = await import("@/lib/force-refresh");

    await listSeasonsFor(VEIKKAUSLIIGA);
    await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(resolveTasoSeasonContext).not.toHaveBeenCalled();
  });

  it("offers only the seasons the app already holds rows for", async () => {
    // The provider's range is the wrong list on its own: it includes seasons
    // never stored here, and offering one would let the tool *import* a season.
    // New seasons arrive through the ordinary sync, and there is nothing to
    // correct in a season we hold nothing for.
    state.storedSeasons = [2026, 2016];
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    const result = await listSeasonsFor(VEIKKAUSLIIGA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seasons).toEqual([
      { seasonId: 2026, label: "2026" },
      { seasonId: 2016, label: "2016" },
    ]);
  });

  it("offers nothing for a competition the app holds no rows for", async () => {
    state.storedSeasons = [];
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    expect(await listSeasonsFor(VEIKKAUSLIIGA)).toEqual({ ok: true, seasons: [] });
  });

  it("never offers a season outside the competition's own range", async () => {
    // Stored rows older than a competition's floor exist — data from before the
    // floor was configured — and must not widen what the tool offers.
    state.storedSeasons = [2026, 2015];
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    const result = await listSeasonsFor({ source: "taso", code: "M1L" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Ykkösliiga did not exist in 2015.
    expect(result.seasons.map((season) => season.seasonId)).toEqual([2026]);
  });

  it("refuses to preview a season the app holds nothing for", async () => {
    state.storedSeasons = [2016];
    const { previewRefresh } = await import("@/lib/force-refresh");

    expect(await previewRefresh(VEIKKAUSLIIGA, 2026)).toEqual({ ok: false, reason: "input" });
  });

  it("carries the foreign picker's own season labels", async () => {
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    const result = await listSeasonsFor({ source: "football-data", code: "PL" });

    expect(result).toEqual({
      ok: true,
      seasons: [
        { seasonId: 2025, label: "2025/26" },
        { seasonId: 2024, label: "2024/25" },
      ],
    });
  });

  it("refuses a competition this app does not have", async () => {
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    expect(await listSeasonsFor({ source: "taso", code: "NOPE" })).toEqual({
      ok: false,
      reason: "input",
    });
  });

  it("tells a database failure apart from a provider failure", async () => {
    // `"read"` exists so an operator knows which system to look at. Folding it
    // into `"provider"` would send them to the wrong one.
    state.seasonReadThrows = true;
    const { listSeasonsFor, previewRefresh } = await import("@/lib/force-refresh");

    expect(await listSeasonsFor(VEIKKAUSLIIGA)).toEqual({ ok: false, reason: "read" });
    expect(await previewRefresh(VEIKKAUSLIIGA, 2026)).toEqual({ ok: false, reason: "read" });
  });

  it("reports a provider failure rather than an empty list", async () => {
    // An empty list would render as a season picker with nothing in it, which
    // reads as "this competition has no seasons" rather than "ask again".
    state.seasonListThrows = true;
    const { listSeasonsFor } = await import("@/lib/force-refresh");

    expect(await listSeasonsFor(VEIKKAUSLIIGA)).toEqual({ ok: false, reason: "provider" });
  });
});

describe("input the browser can send", () => {
  it.each([[2026.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "refuses the non-integer season %s",
    async (seasonId) => {
      // A server action is a public endpoint; the `<select>` that normally
      // produces this value guarantees nothing.
      const { previewRefresh } = await import("@/lib/force-refresh");

      expect(await previewRefresh(VEIKKAUSLIIGA, seasonId)).toEqual({
        ok: false,
        reason: "input",
      });
    }
  );

  it("records the run when an apply cannot learn which seasons exist", async () => {
    // An attempted run that failed belongs in the log, unlike a malformed
    // request.
    state.seasonListThrows = true;
    const { applyRefresh } = await import("@/lib/force-refresh");

    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, "hash", "admin-1");

    expect(result).toEqual({ ok: false, reason: "provider" });
    // No label: the run failed before the season range could be resolved, so
    // the picker's spelling of this season is genuinely unknown.
    expect(recordFailure).toHaveBeenCalledWith(VEIKKAUSLIIGA, 2026, "provider", "admin-1");
  });

  it("does not record a run for a malformed apply request", async () => {
    const { applyRefresh } = await import("@/lib/force-refresh");

    await applyRefresh({ source: "taso", code: "NOPE" }, 2026, "hash", "admin-1");

    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("refuses an unknown competition on apply too, not only on preview", async () => {
    const { applyRefresh } = await import("@/lib/force-refresh");

    expect(await applyRefresh({ source: "taso", code: "NOPE" }, 2026, "hash", "admin-1")).toEqual({
      ok: false,
      reason: "input",
    });
  });

  it("reports a season-list failure as a provider failure", async () => {
    state.seasonListThrows = true;
    const { previewRefresh } = await import("@/lib/force-refresh");

    expect(await previewRefresh(VEIKKAUSLIIGA, 2026)).toEqual({ ok: false, reason: "provider" });
  });
});

describe("the foreign provider", () => {
  const PREMIER_LEAGUE = { source: "football-data", code: "PL" } as const;

  async function foreignHash() {
    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(PREMIER_LEAGUE, 2025);
    if (!result.ok) throw new Error("preview refused");
    return result.preview;
  }

  it("previews with no group counts at all", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" }), match(2)];

    const preview = await foreignHash();

    expect(preview.matches).toEqual({ inserted: 1, updated: 1, deleted: 0 });
    // Null rather than zeroes: football-data stores no group standings, so
    // "none exist" must not read as "none changed".
    expect(preview.groupRows).toBeNull();
    expect(preview.deductionChanges).toEqual([]);
    noWriterRan();
  });

  it("applies with nothing to remove, and deletes nothing", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" })];

    const preview = await foreignHash();
    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(PREMIER_LEAGUE, 2025, preview.snapshotHash, "admin-1");

    expect(result.ok).toBe(true);
    expect(synchronizeForeignMatches).toHaveBeenCalledTimes(1);
    expect(state.deleteCalls).toBe(0);
  });

  it("applies through the foreign writer, never the TASO one", async () => {
    state.storedMatches = [match(1), match(7)];
    state.providerMatches = [match(1)];

    const preview = await foreignHash();
    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(PREMIER_LEAGUE, 2025, preview.snapshotHash, "admin-1");

    expect(result.ok).toBe(true);
    expect(synchronizeForeignMatches).toHaveBeenCalledTimes(1);
    expect(synchronizeTasoMatches).not.toHaveBeenCalled();
    expect(synchronizeGroupTeams).not.toHaveBeenCalled();
    expect(state.deleteCalls).toBe(1);
  });
});

describe("a database that will not answer", () => {
  it("refuses rather than throwing out of the engine", async () => {
    // The caller is a server action answering a client component, so a throw
    // reaches the admin as a generic browser error with nothing to act on. It
    // is its own reason, not `"provider"`: the provider answered fine.
    //
    // The season list read succeeds here and the season's own rows fail, which
    // is the path through `computeDiff` — a different one from the season-list
    // failure above, and reachable on its own.
    state.storedReadThrows = true;

    const { previewRefresh } = await import("@/lib/force-refresh");
    const result = await previewRefresh(VEIKKAUSLIIGA, 2026);

    expect(result).toEqual({ ok: false, reason: "read" });
    noWriterRan();
    expect(logger.error).toHaveBeenCalled();
  });

  it("records the failed run when an apply cannot read", async () => {
    state.seasonReadThrows = true;

    const { applyRefresh } = await import("@/lib/force-refresh");
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, "hash", "admin-1");

    expect(result).toEqual({ ok: false, reason: "read" });
    // No label: the first read to fail is the one listing which seasons are
    // stored, so the season range never resolved and its spelling is unknown.
    expect(recordFailure).toHaveBeenCalledWith(VEIKKAUSLIIGA, 2026, "read", "admin-1");
  });
});

describe("a write that fails", () => {
  it("reports the failure, records it, and claims nothing was applied", async () => {
    state.storedMatches = [match(1)];
    state.providerMatches = [match(1, { status: "POSTPONED" })];
    state.normalizedGroupTeams = [groupTeam()];

    const { previewRefresh, applyRefresh } = await import("@/lib/force-refresh");
    const preview = await previewRefresh(VEIKKAUSLIIGA, 2026);
    if (!preview.ok) throw new Error("preview refused");

    state.transactionThrows = true;
    const result = await applyRefresh(VEIKKAUSLIIGA, 2026, preview.preview.snapshotHash, "admin-1");

    expect(result).toEqual({ ok: false, reason: "write" });
    expect(recordFailure).toHaveBeenCalledWith(VEIKKAUSLIIGA, 2026, "write", "admin-1", "2026");
    expect(recordSuccess).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
