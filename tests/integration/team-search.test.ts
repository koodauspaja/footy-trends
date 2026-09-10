import { and, gte, inArray, lte } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { MAX_RESULTS, searchTeams } from "@/lib/team-search";

/**
 * Team search against a real Postgres, from specs/027-team-search.md.
 *
 * What only real rows can show: that `translate(...) like ...` really folds
 * Finnish letters in the database rather than only in TypeScript, that a
 * renamed club is found by a name it no longer carries, that the placeholder id
 * and the empty name are really excluded by the query, and that `%` typed by a
 * reader does not match everything.
 */

/**
 * Every provider match id these fixtures use, as a **range** rather than a list.
 *
 * The cap test inserts twenty-five rows of its own. Listing ids separately meant
 * a failure before its manual cleanup left them in the shared database, to
 * contaminate every later test and every later run. A range cannot drift from
 * what the tests actually insert.
 */
const TASO_ID_FLOOR = 993_000;
const TASO_ID_CEILING = 993_999;
const FD_IDS = [993101, 993102];

/** Far outside anything real, so a fixture can never collide with stored data. */
const JARVENPAA = 970001;
const HARMA = 970002;
const RENAMED = 970003;
const NAMELESS = 970004;
const FOREIGN = 970005;
const OPPONENT = 979999;

function tasoRow(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: 993001,
    competitionCode: "spljp90",
    categoryId: "VL",
    seasonId: 990990,
    groupId: 1,
    groupName: "Mestaruussarja",
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: JARVENPAA,
    homeTeamName: "Järvenpää",
    awayTeamProviderId: OPPONENT,
    awayTeamName: "Integration Opponent",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

function footballDataRow(overrides: Partial<typeof matches.$inferInsert> = {}) {
  return {
    providerMatchId: 993101,
    competitionCode: "PL",
    seasonId: 990990,
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    stage: "REGULAR_SEASON",
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: FOREIGN,
    homeTeamName: "Integration Järvi FC",
    awayTeamProviderId: OPPONENT,
    awayTeamName: "Integration City",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

async function clearFixtures() {
  await db
    .delete(tasoMatches)
    .where(
      and(
        gte(tasoMatches.providerMatchId, TASO_ID_FLOOR),
        lte(tasoMatches.providerMatchId, TASO_ID_CEILING)
      )
    );
  await db.delete(matches).where(inArray(matches.providerMatchId, FD_IDS));
}

const idsOf = (teams: Awaited<ReturnType<typeof searchTeams>>) =>
  teams.map((team) => team.teamProviderId);

beforeEach(clearFixtures);
afterEach(clearFixtures);

describe("searching real rows", () => {
  it.each([
    ["a plain term finds an accented name", "jarvenpaa"],
    ["an accented term finds it too", "järvenpää"],
    ["case does not matter", "JARVENPAA"],
    ["accents and case together", "JÄRVENPÄÄ"],
  ])("%s", async (_case, term) => {
    // The fold has to happen in Postgres, not only in TypeScript: the stored
    // side is folded by the query.
    await db.insert(tasoMatches).values(tasoRow());

    expect(idsOf(await searchTeams(term))).toContain(JARVENPAA);
  });

  it("matches a substring anywhere in the name", async () => {
    await db.insert(tasoMatches).values(tasoRow({ homeTeamName: "FC Härmä United" }));

    expect(idsOf(await searchTeams("harma"))).toContain(JARVENPAA);
  });

  it("finds a team that only ever played away", async () => {
    await db.insert(tasoMatches).values(
      tasoRow({
        homeTeamProviderId: OPPONENT,
        homeTeamName: "Integration Opponent",
        awayTeamProviderId: HARMA,
        awayTeamName: "Härmä",
      })
    );

    expect(idsOf(await searchTeams("harma"))).toContain(HARMA);
  });

  it("finds a renamed club by a name it no longer carries, and shows the current one", async () => {
    // The whole reason the search and the display are two steps.
    await db.insert(tasoMatches).values([
      tasoRow({
        providerMatchId: 993002,
        homeTeamProviderId: RENAMED,
        homeTeamName: "Integration Vanha Nimi",
        kickoffAt: new Date("2020-08-01T15:00:00Z"),
      }),
      tasoRow({
        providerMatchId: 993003,
        homeTeamProviderId: RENAMED,
        homeTeamName: "Integration Uusi Nimi",
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    const found = await searchTeams("vanha nimi");
    const team = found.find((candidate) => candidate.teamProviderId === RENAMED);

    expect(team?.name).toBe("Integration Uusi Nimi");
  });

  it("excludes the placeholder team id, which is a bracket slot rather than a team", async () => {
    await db
      .insert(tasoMatches)
      .values(
        tasoRow({ providerMatchId: 993004, homeTeamProviderId: 0, homeTeamName: "Järvenpää" })
      );

    expect(idsOf(await searchTeams("jarvenpaa"))).not.toContain(0);
  });

  it("excludes a team stored with an empty name", async () => {
    await db.insert(tasoMatches).values(
      tasoRow({
        providerMatchId: 993005,
        homeTeamProviderId: NAMELESS,
        homeTeamName: "",
      })
    );

    // An empty name matches every substring pattern, so a missing guard would
    // put it in the results for *any* search.
    expect(idsOf(await searchTeams("jarvenpaa"))).not.toContain(NAMELESS);
  });

  it("treats a typed % as a character, not as a wildcard", async () => {
    await db.insert(tasoMatches).values(tasoRow());

    // Unescaped, `%%` matches every stored team there is.
    expect(await searchTeams("%%")).toEqual([]);
  });

  it("searches both providers at once", async () => {
    await db.insert(tasoMatches).values(tasoRow());
    await db.insert(matches).values(footballDataRow());

    const found = await searchTeams("jarvi");

    expect(idsOf(found)).toContain(FOREIGN);
  });

  it("keeps the two providers' id spaces apart", async () => {
    // The same number in each provider is two different teams.
    await db.insert(tasoMatches).values(tasoRow({ homeTeamProviderId: 970777 }));
    await db
      .insert(matches)
      .values(footballDataRow({ homeTeamProviderId: 970777, homeTeamName: "Järvenpää" }));

    const found = await searchTeams("jarvenpaa");
    const sources = found
      .filter((team) => team.teamProviderId === 970777)
      .map((team) => team.source)
      .sort();

    expect(sources).toEqual(["football-data", "taso"]);
  });

  it("orders by the most recent appearance", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({
        providerMatchId: 993002,
        homeTeamProviderId: JARVENPAA,
        homeTeamName: "Järvenpää A",
        kickoffAt: new Date("2020-08-01T15:00:00Z"),
      }),
      tasoRow({
        providerMatchId: 993003,
        homeTeamProviderId: HARMA,
        homeTeamName: "Järvenpää B",
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    expect(idsOf(await searchTeams("jarvenpaa"))).toEqual([HARMA, JARVENPAA]);
  });

  it("names the competition and season of the most recent appearance", async () => {
    await db.insert(tasoMatches).values(tasoRow({ categoryId: "VL", seasonId: 990990 }));

    const team = (await searchTeams("jarvenpaa")).find(
      (candidate) => candidate.teamProviderId === JARVENPAA
    );

    expect(team?.competitionName).toBe("Veikkausliiga");
    expect(team?.seasonId).toBe(990990);
    expect(team?.region).toBe("kotimaa");
  });

  it("gives a TASO national-team side no region, because it has no page", async () => {
    await db.insert(tasoMatches).values(
      tasoRow({
        providerMatchId: 993006,
        competitionCode: "maajp2026",
        categoryId: "UNL",
        homeTeamProviderId: HARMA,
        homeTeamName: "Järvenpää Maa",
      })
    );

    const team = (await searchTeams("jarvenpaa maa")).find(
      (candidate) => candidate.teamProviderId === HARMA
    );

    expect(team?.region).toBeNull();
  });

  it("returns nothing for a term below the minimum, without touching the database", async () => {
    await db.insert(tasoMatches).values(tasoRow());

    expect(await searchTeams("j")).toEqual([]);
  });

  it("never returns more than the cap", async () => {
    await db.insert(tasoMatches).values(
      Array.from({ length: 25 }, (_, index) => ({
        ...tasoRow(),
        providerMatchId: 993200 + index,
        homeTeamProviderId: 971000 + index,
        homeTeamName: `Järvenpää ${index}`,
      }))
    );

    expect((await searchTeams("jarvenpaa")).length).toBeLessThanOrEqual(MAX_RESULTS);
    // No manual cleanup: these ids sit inside the range `clearFixtures` sweeps,
    // so a failure above cannot leave them behind for the next test to trip on.
  });
});
