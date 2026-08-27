import { describe, expect, it } from "vitest";
import {
  byKickoffThenId,
  competitionIdForYear,
  competitionLabel,
  HUUHKAJAT_ACTIVE_YEAR,
  HUUHKAJAT_YEARS,
  huuhkajatCategories,
  isFinlandMatch,
  matchCountLabel,
} from "@/lib/huuhkajat";

describe("competitionIdForYear", () => {
  it("maps 2026 to the year-shaped id", () => {
    expect(competitionIdForYear(2026)).toBe("maajp2026");
  });

  /**
   * The whole reason this is a lookup: `maajp18` holds season 2021, and
   * `seasonFromCompetitionId` — which reads an id's last two characters —
   * would call it 2018.
   */
  it("maps 2021 to maajp18, which is not year-shaped", () => {
    expect(competitionIdForYear(2021)).toBe("maajp18");
  });

  it("has no id for a year outside the table", () => {
    expect(competitionIdForYear(2020)).toBeNull();
    expect(competitionIdForYear(2019)).toBeNull();
  });

  it("covers exactly 2021 through 2026, newest first", () => {
    expect(HUUHKAJAT_YEARS).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });

  it("treats the newest year as the active one", () => {
    expect(HUUHKAJAT_ACTIVE_YEAR).toBe(2026);
  });
});

describe("huuhkajatCategories", () => {
  it("selects only the men's A team, by name suffix", () => {
    const names = {
      WCQ: "MM-karsinnat Huuhkajat",
      UNL: "UEFA Nations League Huuhkajat",
      WWCQ: "MM-karsinnat 2023 Helmarit",
      U21ECQ: "EM-karsinnat U21-miehet",
      WU17M: "Maaottelut U17-tytöt",
    };

    expect(
      huuhkajatCategories(names)
        .map((c) => c.categoryId)
        .sort()
    ).toEqual(["UNL", "WCQ"]);
  });

  it("is empty for a season with no Huuhkajat categories", () => {
    expect(huuhkajatCategories({ NA: "Naisten A-maaottelut" })).toEqual([]);
  });

  it("carries each category's display label, so no second lookup is needed", () => {
    expect(huuhkajatCategories({ Miehet: "Muut A-maaottelut Huuhkajat" })).toEqual([
      { categoryId: "Miehet", competitionName: "Muut A-maaottelut" },
    ]);
  });
});

describe("competitionLabel", () => {
  it("strips the trailing suffix", () => {
    expect(competitionLabel("UEFA Nations League Huuhkajat")).toBe("UEFA Nations League");
    expect(competitionLabel("EM-lopputurnaus Huuhkajat")).toBe("EM-lopputurnaus");
  });

  /**
   * TASO names the friendlies differently either side of 2022 and both stand
   * as it spells them — normalising would reintroduce the hardcoded id→name
   * table the suffix rule exists to avoid.
   */
  it("leaves 2021's wording alone rather than normalising it to the later one", () => {
    expect(competitionLabel("Muut A-maaottelut Huuhkajat")).toBe("Muut A-maaottelut");
    expect(competitionLabel("A-maaottelut Huuhkajat")).toBe("A-maaottelut");
  });

  it("leaves a name without the suffix unchanged", () => {
    expect(competitionLabel("Miesten A-maaottelut")).toBe("Miesten A-maaottelut");
  });

  it("does not strip a bare 'Huuhkajat' into an empty label", () => {
    expect(competitionLabel("Huuhkajat")).toBe("Huuhkajat");
  });
});

describe("isFinlandMatch", () => {
  /**
   * 2023's `ECQ` returns all 30 matches of the qualifying group, of which 10
   * are Finland's — without this the page lists `Kazakstan - Slovenia`.
   */
  it("keeps a match Finland played either side of", () => {
    expect(isFinlandMatch({ homeTeamName: "Suomi", awayTeamName: "Malta" })).toBe(true);
    expect(isFinlandMatch({ homeTeamName: "Tanska", awayTeamName: "Suomi" })).toBe(true);
  });

  it("drops a match between two other countries", () => {
    expect(isFinlandMatch({ homeTeamName: "Kazakstan", awayTeamName: "Slovenia" })).toBe(false);
  });

  it("drops a placeholder row with no teams", () => {
    expect(isFinlandMatch({ homeTeamName: "", awayTeamName: "" })).toBe(false);
  });
});

describe("byKickoffThenId", () => {
  const match = (providerMatchId: number, iso: string) => ({
    providerMatchId,
    kickoffAt: new Date(iso),
  });

  it("orders by kickoff", () => {
    const sorted = [match(1, "2026-06-05T19:00:00Z"), match(2, "2026-03-27T19:00:00Z")].sort(
      byKickoffThenId
    );

    expect(sorted.map((m) => m.providerMatchId)).toEqual([2, 1]);
  });

  it("breaks a same-kickoff tie by id, so the order is stable across renders", () => {
    const sorted = [match(9, "2026-06-05T19:00:00Z"), match(4, "2026-06-05T19:00:00Z")].sort(
      byKickoffThenId
    );

    expect(sorted.map((m) => m.providerMatchId)).toEqual([4, 9]);
  });
});

describe("matchCountLabel", () => {
  it("uses the singular for one match", () => {
    expect(matchCountLabel(1)).toBe("1 ottelu");
  });

  it("uses the partitive for any other count", () => {
    expect(matchCountLabel(0)).toBe("0 ottelua");
    expect(matchCountLabel(12)).toBe("12 ottelua");
    expect(matchCountLabel(33)).toBe("33 ottelua");
  });
});
