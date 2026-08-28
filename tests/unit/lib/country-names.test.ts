import { describe, expect, it } from "vitest";
import {
  toFinnishCountryName,
  toFinnishTasoTeamName,
  toFinnishTasoTeamNames,
  toFinnishTeamNames,
} from "@/lib/country-names";

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

describe("toFinnishTasoTeamName", () => {
  /**
   * TASO is mostly Finnish, and only the older `maajp18` content — the 2019
   * Euro qualifiers and the 2020 Nations League — carries English. Eight rows,
   * four countries. See specs/017-huuhkajat.md.
   */
  it("translates the nine names TASO reports in English", () => {
    expect(toFinnishTasoTeamName("Croatia")).toBe("Kroatia");
    expect(toFinnishTasoTeamName("Cyprus")).toBe("Kypros");
    expect(toFinnishTasoTeamName("Czech Republic")).toBe("Tšekki");
    expect(toFinnishTasoTeamName("Portugal")).toBe("Portugali");
    expect(toFinnishTasoTeamName("Scotland")).toBe("Skotlanti");
    expect(toFinnishTasoTeamName("Greece")).toBe("Kreikka");
    expect(toFinnishTasoTeamName("Italy")).toBe("Italia");
    expect(toFinnishTasoTeamName("Republic of Ireland")).toBe("Irlanti");
    expect(toFinnishTasoTeamName("Bosnia and Herzegovina")).toBe("Bosnia-Hertsegovina");
  });

  /**
   * The defect this fixes was one country reading two ways on one page:
   * `Greece` in 2019 and `Kreikka` in a later year. Mapping to TASO's own
   * Finnish spelling is what keeps them identical — `FINNISH_COUNTRY_NAMES`
   * would have produced `Bosnia ja Hertsegovina` here and reintroduced it.
   */
  it("matches the spelling TASO itself uses elsewhere", () => {
    expect(toFinnishTasoTeamName("Bosnia and Herzegovina")).toBe(
      toFinnishTasoTeamName("Bosnia-Hertsegovina")
    );
    expect(toFinnishTasoTeamName("Republic of Ireland")).toBe(toFinnishTasoTeamName("Irlanti"));
  });

  /**
   * Three of Helmarit's English names appear in Finnish elsewhere in the same
   * data, so leaving them would put one country under two spellings on one
   * page — the defect this map exists to prevent.
   */
  it("collapses the three that TASO spells both ways", () => {
    expect(toFinnishTasoTeamName("Croatia")).toBe(toFinnishTasoTeamName("Kroatia"));
    expect(toFinnishTasoTeamName("Portugal")).toBe(toFinnishTasoTeamName("Portugali"));
    expect(toFinnishTasoTeamName("Scotland")).toBe(toFinnishTasoTeamName("Skotlanti"));
  });

  /**
   * These are the same word in both languages and must not be "corrected".
   */
  it("leaves names identical in Finnish alone", () => {
    for (const name of [
      "Albania",
      "Georgia",
      "Latvia",
      "Montenegro",
      "Romania",
      "Serbia",
      "Slovakia",
      "Wales",
    ]) {
      expect(toFinnishTasoTeamName(name)).toBe(name);
    }
  });

  it("leaves a name TASO already publishes in Finnish alone", () => {
    expect(toFinnishTasoTeamName("Valko-Venäjä")).toBe("Valko-Venäjä");
    expect(toFinnishTasoTeamName("Suomi")).toBe("Suomi");
  });

  it("passes an unmapped name through rather than mangling it", () => {
    expect(toFinnishTasoTeamName("Wales")).toBe("Wales");
  });
});

describe("toFinnishTasoTeamNames", () => {
  it("translates both sides of every match", () => {
    const matches = [
      { homeTeamName: "Suomi", awayTeamName: "Greece" },
      { homeTeamName: "Italy", awayTeamName: "Suomi" },
    ];

    expect(toFinnishTasoTeamNames(matches)).toEqual([
      { homeTeamName: "Suomi", awayTeamName: "Kreikka" },
      { homeTeamName: "Italia", awayTeamName: "Suomi" },
    ]);
  });

  it("keeps every other field on the row", () => {
    const [row] = toFinnishTasoTeamNames([
      { homeTeamName: "Greece", awayTeamName: "Suomi", providerMatchId: 7 },
    ]);

    expect(row?.providerMatchId).toBe(7);
  });
});
