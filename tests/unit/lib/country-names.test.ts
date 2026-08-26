import { describe, expect, it } from "vitest";
import { toFinnishCountryName, toFinnishTeamNames } from "@/lib/country-names";

describe("toFinnishCountryName", () => {
  it("translates the names that actually differ", () => {
    expect(toFinnishCountryName("Netherlands")).toBe("Alankomaat");
    expect(toFinnishCountryName("Ivory Coast")).toBe("Norsunluurannikko");
    expect(toFinnishCountryName("United States")).toBe("Yhdysvallat");
    expect(toFinnishCountryName("Czechia")).toBe("Tšekki");
    expect(toFinnishCountryName("South Korea")).toBe("Etelä-Korea");
    expect(toFinnishCountryName("Congo DR")).toBe("Kongon demokraattinen tasavalta");
    expect(toFinnishCountryName("Bosnia-Herzegovina")).toBe("Bosnia ja Hertsegovina");
  });

  it("keeps the names Finnish already spells the same way", () => {
    for (const name of ["Albania", "Ghana", "Panama", "Qatar", "Uruguay", "Curaçao"]) {
      expect(toFinnishCountryName(name)).toBe(name);
    }
  });

  it("falls through for a country that has not qualified before", () => {
    // Readable-but-English beats a mangled guess; add it to the map instead.
    expect(toFinnishCountryName("Faroe Islands")).toBe("Faroe Islands");
  });

  it("never translates a club name", () => {
    // Club names are proper nouns, and this map is only ever applied to
    // national-team competitions.
    expect(toFinnishCountryName("Paris Saint-Germain FC")).toBe("Paris Saint-Germain FC");
    expect(toFinnishCountryName("FC Bayern München")).toBe("FC Bayern München");
  });
});

describe("toFinnishTeamNames", () => {
  it("translates both sides and leaves the rest of the row alone", () => {
    const matches = [
      {
        providerMatchId: 1,
        homeTeamName: "Netherlands",
        awayTeamName: "Ivory Coast",
        homeGoals: 2,
      },
    ];

    expect(toFinnishTeamNames(matches)).toEqual([
      {
        providerMatchId: 1,
        homeTeamName: "Alankomaat",
        awayTeamName: "Norsunluurannikko",
        homeGoals: 2,
      },
    ]);
  });

  it("does not mutate its input", () => {
    const matches = [{ homeTeamName: "Germany", awayTeamName: "Spain" }];
    toFinnishTeamNames(matches);

    expect(matches[0]?.homeTeamName).toBe("Germany");
  });

  it("handles an empty list", () => {
    expect(toFinnishTeamNames([])).toEqual([]);
  });
});
