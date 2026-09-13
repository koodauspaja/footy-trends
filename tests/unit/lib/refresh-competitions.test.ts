import { describe, expect, it } from "vitest";
import { competitionsInRegion } from "@/lib/competitions";
import { DOMESTIC_COMPETITIONS } from "@/lib/domestic-competitions";
import {
  competitionNameFor,
  isKnownCompetition,
  listCompetitionOptions,
} from "@/lib/refresh-competitions";
import { decodeChoice } from "@/lib/refresh-view";

/**
 * Which competitions the forced refresh offers, from
 * specs/029-forced-season-refresh.md.
 */

describe("listCompetitionOptions", () => {
  it("offers every Finnish competition, in the picker's own order", () => {
    const { domestic } = listCompetitionOptions();

    expect(domestic.map((option) => option.label)).toEqual(
      DOMESTIC_COMPETITIONS.map((competition) => competition.name)
    );
  });

  it("offers every foreign competition", () => {
    const { foreign } = listCompetitionOptions();

    expect(foreign.map((option) => option.label)).toEqual(
      competitionsInRegion("foreign").map((competition) => competition.name)
    );
  });

  it("offers no national-team competition", () => {
    const { domestic, foreign } = listCompetitionOptions();
    const offered = new Set([...domestic, ...foreign].map((option) => option.value));

    for (const competition of competitionsInRegion("national-teams")) {
      expect(offered.has(`football-data:${competition.code}`)).toBe(false);
    }
  });

  it("encodes every option so it decodes back to a competition the tool accepts", () => {
    const { domestic, foreign } = listCompetitionOptions();

    for (const option of [...domestic, ...foreign]) {
      const choice = decodeChoice(option.value);
      expect(choice).not.toBeNull();
      if (choice === null) continue;
      expect(isKnownCompetition(choice)).toBe(true);
    }
  });
});

describe("isKnownCompetition", () => {
  it("accepts a Finnish competition", () => {
    expect(isKnownCompetition({ source: "taso", code: "VL" })).toBe(true);
  });

  it("accepts a foreign competition", () => {
    expect(isKnownCompetition({ source: "football-data", code: "PL" })).toBe(true);
  });

  it("rejects a national-team competition", () => {
    // Same registry as the foreign ones, deliberately not offered: they have no
    // standings depending on a deduction, which is the problem this solves.
    const [nationalTeam] = competitionsInRegion("national-teams");
    expect(nationalTeam).toBeDefined();
    expect(isKnownCompetition({ source: "football-data", code: nationalTeam?.code ?? "WC" })).toBe(
      false
    );
  });

  it("rejects a Finnish code offered under the foreign source, and the reverse", () => {
    expect(isKnownCompetition({ source: "football-data", code: "VL" })).toBe(false);
    expect(isKnownCompetition({ source: "taso", code: "PL" })).toBe(false);
  });

  it("rejects an unknown code", () => {
    expect(isKnownCompetition({ source: "taso", code: "NOPE" })).toBe(false);
  });
});

describe("competitionNameFor", () => {
  it("names a competition from each registry", () => {
    expect(competitionNameFor({ source: "taso", code: "VL" })).toBe("Veikkausliiga");
    expect(competitionNameFor({ source: "football-data", code: "PL" })).toBe(
      competitionsInRegion("foreign").find((competition) => competition.code === "PL")?.name
    );
  });
});
