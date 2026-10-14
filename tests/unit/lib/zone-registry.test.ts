import { describe, expect, it } from "vitest";
import { groupZones } from "@/lib/competition-zones";
import { SUPPORTED_COMPETITIONS } from "@/lib/competitions";
import { cupCaveat, registryLevels, ZONE_REGISTRY } from "@/lib/zone-registry";

/**
 * The foreign leagues' hand-kept zones: that every league has every stored
 * season, that no entry outgrows its table, and what a few of them read as.
 *
 * decisions/065-foreign-league-zones.md
 */

const STORED_SEASONS = [2023, 2024, 2025, 2026];
const LEAGUES = ["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA"];

function labels(code: string, season: number) {
  return registryLevels(code, season).map((level) => [level.teamCount, level.label, level.kind]);
}

describe("the zone registry", () => {
  it("holds the nine foreign leagues and no other competition", () => {
    expect(Object.keys(ZONE_REGISTRY).sort()).toEqual([...LEAGUES].sort());
    const leagueCodes = SUPPORTED_COMPETITIONS.filter(
      (competition) => competition.region === "foreign" && competition.format === "league"
    ).map((competition) => competition.code);
    expect(leagueCodes.sort()).toEqual([...LEAGUES].sort());
  });

  it.each(LEAGUES.flatMap((code) => STORED_SEASONS.map((season) => [code, season] as const)))(
    "%s %i has an entry that fits its table",
    (code, season) => {
      const levels = registryLevels(code, season);
      const covered = levels.reduce((total, level) => total + level.teamCount, 0);

      expect(levels.length).toBeGreaterThan(0);
      expect(covered).toBeLessThanOrEqual(ZONE_REGISTRY[code]?.teams ?? 0);
      expect(levels.every((level) => level.teamCount > 0)).toBe(true);
      expect(levels.map((level) => level.level)).toEqual(levels.map((_level, index) => index + 1));
    }
  );

  it("numbers the stretch of a gap as a level of its own, without a label or a kind", () => {
    // Brazil 2023: Libertadores 1–4, qualifying 5–6, a gap at 7, Sudamericana
    // 8–14, a gap at 15–16, relegation 17–20.
    expect(labels("BSA", 2023)).toEqual([
      [4, "Copa Libertadores", "cup"],
      [2, "Copa Libertadoresin karsinta", "cup"],
      [1, null, undefined],
      [7, "Copa Sudamericana", "cup"],
      [2, null, undefined],
      [4, "Putoaa", "relegation"],
    ]);
  });

  it("gives each kind to its places: cup, promotion, play-off and relegation", () => {
    expect(labels("ELC", 2026)).toEqual([
      [2, "Nousee", "promotion"],
      [6, "Nousukarsinta", "playoff"],
      [13, null, undefined],
      [3, "Putoaa", "relegation"],
    ]);
    expect(labels("FL1", 2026).map(([, label, kind]) => `${label}:${kind}`)).toEqual([
      "Mestarien liiga:cup",
      "Mestarien liigan karsinta:cup",
      "Eurooppa-liiga:cup",
      "Konferenssiliiga:cup",
      "null:undefined",
      "Putoamiskarsinta:playoff",
      "Putoaa:relegation",
    ]);
  });

  it("takes the Eredivisie's play-offs for the Conference League as a play-off, not a cup place", () => {
    const kinds = registryLevels("DED", 2024).filter(
      (level) => level.label === "Karsinta Europeleihin"
    );

    expect(kinds).toHaveLength(2);
    expect(kinds.every((level) => level.kind === "playoff")).toBe(true);
  });

  it("splits a season's places where the page does, the Eredivisie 2024's Europa League at 7th", () => {
    const zones = groupZones(registryLevels("DED", 2024), 18).zones;

    expect(zones.map((zone) => `${zone.from}-${zone.to} ${zone.label}`)).toEqual([
      "1-2 Mestarien liiga",
      "3-3 Mestarien liigan karsinta",
      "4-4 Eurooppa-liigan karsinta",
      "5-6 Karsinta Europeleihin",
      "7-7 Eurooppa-liiga",
      "8-9 Karsinta Europeleihin",
      "16-16 Putoamiskarsinta",
      "17-18 Putoaa",
    ]);
  });

  it("is empty for a season the registry does not hold", () => {
    expect(registryLevels("PL", 2022)).toEqual([]);
  });

  it.each(["CL", "VL", "NOPE", "constructor", "__proto__"])(
    "is empty for %s, which is not one of the nine",
    (code) => {
      expect(registryLevels(code, 2025)).toEqual([]);
    }
  );
});

describe("cupCaveat", () => {
  it("names Europe for a league with a European place", () => {
    expect(cupCaveat("PL", registryLevels("PL", 2025))).toBe(
      "Eurooppa-paikat voivat muuttua cup-tuloksilla"
    );
  });

  it("names the cups for Brazil", () => {
    expect(cupCaveat("BSA", registryLevels("BSA", 2025))).toBe(
      "Cup-paikat voivat muuttua cup-tuloksilla"
    );
  });

  it("is none when no level is a cup place", () => {
    expect(cupCaveat("ELC", registryLevels("ELC", 2025))).toBeNull();
  });
});
