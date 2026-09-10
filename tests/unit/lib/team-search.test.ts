import { beforeEach, describe, expect, it, vi } from "vitest";
import { matches } from "@/db/schema";

/**
 * Finding a team by name, from specs/027-team-search.md.
 *
 * No real database: the CI unit job has no service containers, deliberately
 * (#158). The mock answers the one chain this module uses and records the
 * queries it made. It deliberately does **not** inspect the `where` clause: that
 * is a drizzle SQL object, and asserting on its internals would break on a
 * version bump while proving less than running the query does.
 *
 * So the SQL-semantics half lives in `tests/integration/team-search.test.ts`
 * against real rows — that the fold applies to the *term* as well as the stored
 * name, that a typed `%` is not a wildcard, that id `0` and the empty name are
 * excluded, and that a renamed club is found by its old name. Both halves were
 * mutation-checked; those four mutations survive the unit suite and die here.
 */
const { state, resolveTeamNames } = vi.hoisted(() => ({
  state: {
    sides: new Map<string, unknown[]>(),
    queried: 0,
  },
  resolveTeamNames: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    selectDistinctOn: (columns: { name: string }[]) => ({
      from: (table: unknown) => ({
        where: () => {
          return {
            // No `.limit()`: `distinct on (id)` forces the sort to start with
            // `id`, so limiting here would keep the lowest ids rather than the
            // newest teams. The cap is applied after the merge.
            orderBy: async () => {
              state.queried += 1;
              const side = columns[0]?.name.startsWith("home") === true ? "home" : "away";
              const name = table === matches ? "matches" : "taso_matches";
              return state.sides.get(`${name}:${side}`) ?? [];
            },
          };
        },
      }),
    }),
  },
}));

vi.mock("@/lib/favourites", () => ({ resolveTeamNames }));

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  state.sides.clear();
  state.queried = 0;
  resolveTeamNames.mockReset();
  resolveTeamNames.mockResolvedValue([]);
});

describe("foldTerm", () => {
  it.each([
    ["jarvenpaa", "jarvenpaa"],
    ["Järvenpää", "jarvenpaa"],
    ["HÄRMÄ", "harma"],
    ["Härmä", "harma"],
    ["Åbo", "abo"],
    ["FC Honka", "fc honka"],
  ])("folds %s to %s", async (input, expected) => {
    const { foldTerm } = await import("@/lib/team-search");

    expect(foldTerm(input)).toBe(expected);
  });

  it("folds both a term and a name to the same thing, which is what makes it symmetric", async () => {
    // Folding only one side finds `Järvenpää` from `jarvenpaa` but not the
    // reverse, and the acceptance criteria require both directions.
    const { foldTerm } = await import("@/lib/team-search");

    expect(foldTerm("HÄRMÄ")).toBe(foldTerm("harma"));
  });

  it("trims what the reader typed", async () => {
    const { foldTerm } = await import("@/lib/team-search");

    expect(foldTerm("  Honka  ")).toBe("honka");
  });
});

describe("escapeLike", () => {
  it.each([
    ["%", "\\%"],
    ["_", "\\_"],
    ["100%", "100\\%"],
    ["a_b", "a\\_b"],
  ])("escapes %s, which LIKE would otherwise treat as a wildcard", async (input, expected) => {
    const { escapeLike } = await import("@/lib/team-search");

    expect(escapeLike(input)).toBe(expected);
  });

  it("escapes the backslash first, or the escapes escape each other", async () => {
    const { escapeLike } = await import("@/lib/team-search");

    expect(escapeLike("a\\%b")).toBe("a\\\\\\%b");
  });

  it("leaves an ordinary name alone", async () => {
    const { escapeLike } = await import("@/lib/team-search");

    expect(escapeLike("FC Honka")).toBe("FC Honka");
  });
});

describe("isSearchable", () => {
  it.each([
    ["", false],
    [" ", false],
    ["a", false],
    ["  a  ", false],
    ["ab", true],
    ["  ab  ", true],
  ])("answers %s -> %s", async (term, expected) => {
    const { isSearchable } = await import("@/lib/team-search");

    expect(isSearchable(term)).toBe(expected);
  });
});

describe("searchTeams", () => {
  it("does not query at all for a term that is too short", async () => {
    // One keystroke must not scan the match tables.
    const { searchTeams } = await import("@/lib/team-search");

    expect(await searchTeams("a")).toEqual([]);
    expect(state.queried).toBe(0);
    expect(resolveTeamNames).not.toHaveBeenCalled();
  });

  it("ranks by recency, not by provider id", async () => {
    /**
     * The regression this exists for. `distinct on (id)` forces the sort to
     * start with `id`, so a `LIMIT` on that query keeps the lowest ids — and a
     * team that played last week would be dropped for one that has not played
     * since 2019, purely because its id is larger. The cap belongs after the
     * merge, where the rows are ordered by date.
     */
    const { MAX_RESULTS, searchTeams } = await import("@/lib/team-search");
    state.sides.set("taso_matches:home", [
      // Twenty low ids, all long inactive.
      ...Array.from({ length: MAX_RESULTS }, (_, index) => ({
        teamProviderId: index + 1,
        kickoffAt: at("2019-01-01"),
      })),
      // One high id, active last week.
      { teamProviderId: 999_999, kickoffAt: at("2026-09-01") },
    ]);

    await searchTeams("honka");

    const resolved = resolveTeamNames.mock.calls[0]?.[0] as { teamProviderId: number }[];

    expect(resolved).toHaveLength(MAX_RESULTS);
    expect(resolved[0]?.teamProviderId).toBe(999_999);
  });

  it("asks both providers, on both sides", async () => {
    // A team that only ever played away would be invisible to a home-only query.
    const { searchTeams } = await import("@/lib/team-search");
    await searchTeams("honka");

    expect(state.queried).toBe(4);
  });

  it.each([
    ["the away one is newer", "2020-01-01", "2026-01-01"],
    ["the home one is newer", "2026-01-01", "2020-01-01"],
  ])("collapses a team found on both sides to one result when %s", async (_case, home, away) => {
    // Whichever side is newer must win, so both orders are exercised: keeping
    // the first seen would depend on which query happened to return first.
    state.sides.set("taso_matches:home", [{ teamProviderId: 7, kickoffAt: at(home) }]);
    state.sides.set("taso_matches:away", [{ teamProviderId: 7, kickoffAt: at(away) }]);
    const { searchTeams } = await import("@/lib/team-search");

    await searchTeams("honka");

    expect(resolveTeamNames).toHaveBeenCalledWith([{ source: "taso", teamProviderId: 7 }]);
  });

  it("orders by the newer side, not by which query returned it", async () => {
    // Team 1's newest is 2026 but only on its away row; team 2's is 2024.
    // Ordering on the home rows alone would put them the wrong way round.
    state.sides.set("taso_matches:home", [
      { teamProviderId: 1, kickoffAt: at("2020-01-01") },
      { teamProviderId: 2, kickoffAt: at("2024-01-01") },
    ]);
    state.sides.set("taso_matches:away", [{ teamProviderId: 1, kickoffAt: at("2026-01-01") }]);
    const { searchTeams } = await import("@/lib/team-search");

    await searchTeams("honka");

    expect(resolveTeamNames).toHaveBeenCalledWith([
      { source: "taso", teamProviderId: 1 },
      { source: "taso", teamProviderId: 2 },
    ]);
  });

  it("orders by the most recent appearance, newest first", async () => {
    state.sides.set("taso_matches:home", [
      { teamProviderId: 1, kickoffAt: at("2020-01-01") },
      { teamProviderId: 2, kickoffAt: at("2026-01-01") },
      { teamProviderId: 3, kickoffAt: at("2023-01-01") },
    ]);
    const { searchTeams } = await import("@/lib/team-search");

    await searchTeams("honka");

    expect(resolveTeamNames).toHaveBeenCalledWith([
      { source: "taso", teamProviderId: 2 },
      { source: "taso", teamProviderId: 3 },
      { source: "taso", teamProviderId: 1 },
    ]);
  });

  it("never resolves more teams than the cap, however many sides matched", async () => {
    // Each of the four queries is capped, so four full pages could arrive.
    const rows = (offset: number) =>
      Array.from({ length: 20 }, (_, index) => ({
        teamProviderId: offset + index,
        kickoffAt: at("2026-01-01"),
      }));
    state.sides.set("taso_matches:home", rows(100));
    state.sides.set("taso_matches:away", rows(200));
    state.sides.set("matches:home", rows(300));
    state.sides.set("matches:away", rows(400));
    const { MAX_RESULTS, searchTeams } = await import("@/lib/team-search");

    await searchTeams("honka");

    expect(resolveTeamNames.mock.calls[0]?.[0]).toHaveLength(MAX_RESULTS);
  });

  it("keeps the two providers' id spaces apart", async () => {
    // The same number is a different team in each provider.
    state.sides.set("matches:home", [{ teamProviderId: 7, kickoffAt: at("2026-01-01") }]);
    state.sides.set("taso_matches:home", [{ teamProviderId: 7, kickoffAt: at("2025-01-01") }]);
    const { searchTeams } = await import("@/lib/team-search");

    await searchTeams("honka");

    expect(resolveTeamNames).toHaveBeenCalledWith([
      { source: "football-data", teamProviderId: 7 },
      { source: "taso", teamProviderId: 7 },
    ]);
  });

  it("drops a team whose name could not be resolved", async () => {
    // A row with no stored match has nothing to show and nowhere to go.
    state.sides.set("taso_matches:home", [{ teamProviderId: 7, kickoffAt: at("2026-01-01") }]);
    resolveTeamNames.mockResolvedValue([
      {
        source: "taso",
        teamProviderId: 7,
        name: null,
        region: null,
        competitionCode: null,
        seasonId: null,
      },
    ]);
    const { searchTeams } = await import("@/lib/team-search");

    expect(await searchTeams("honka")).toEqual([]);
  });

  it("names the competition from the region that owns it", async () => {
    state.sides.set("taso_matches:home", [{ teamProviderId: 7, kickoffAt: at("2026-01-01") }]);
    resolveTeamNames.mockResolvedValue([
      {
        source: "taso",
        teamProviderId: 7,
        name: "FC Honka",
        region: "kotimaa",
        competitionCode: "VL",
        seasonId: 2019,
      },
    ]);
    const { searchTeams } = await import("@/lib/team-search");

    expect(await searchTeams("honka")).toEqual([
      {
        source: "taso",
        teamProviderId: 7,
        name: "FC Honka",
        region: "kotimaa",
        competitionName: "Veikkausliiga",
        seasonId: 2019,
      },
    ]);
  });

  it("reports no competition name when there is no region to name it from", async () => {
    // A TASO national-team category has no name in any registry the app carries,
    // and the row is unlinked anyway.
    state.sides.set("taso_matches:home", [{ teamProviderId: 7, kickoffAt: at("2026-01-01") }]);
    resolveTeamNames.mockResolvedValue([
      {
        source: "taso",
        teamProviderId: 7,
        name: "Suomi",
        region: null,
        competitionCode: "UNL",
        seasonId: 2026,
      },
    ]);
    const { searchTeams } = await import("@/lib/team-search");

    const [team] = await searchTeams("suomi");

    expect(team?.competitionName).toBeNull();
    expect(team?.region).toBeNull();
  });

  it("reports no competition name when the registry no longer has the code", async () => {
    state.sides.set("matches:home", [{ teamProviderId: 7, kickoffAt: at("2026-01-01") }]);
    resolveTeamNames.mockResolvedValue([
      {
        source: "football-data",
        teamProviderId: 7,
        name: "Some Club",
        region: "ulkomaat",
        competitionCode: null,
        seasonId: 2026,
      },
    ]);
    const { searchTeams } = await import("@/lib/team-search");

    expect((await searchTeams("some"))[0]?.competitionName).toBeNull();
  });
});
