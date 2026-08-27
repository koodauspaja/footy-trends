import { describe, expect, it } from "vitest";
import {
  byKickoffThenId,
  competitionIdForYear,
  competitionLabel,
  groupByPlayedYear,
  isFinlandMatch,
  MENS_TEAM_ACTIVE_YEAR,
  MENS_TEAM_YEARS,
  matchCountLabel,
  mensTeamCategories,
  playedYear,
} from "@/lib/mens-team";

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
    expect(MENS_TEAM_YEARS).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });

  it("treats the newest year as the active one", () => {
    expect(MENS_TEAM_ACTIVE_YEAR).toBe(2026);
  });
});

describe("mensTeamCategories", () => {
  it("selects only the men's A team, by name suffix", () => {
    const names = {
      WCQ: "MM-karsinnat Huuhkajat",
      UNL: "UEFA Nations League Huuhkajat",
      WWCQ: "MM-karsinnat 2023 Helmarit",
      U21ECQ: "EM-karsinnat U21-miehet",
      WU17M: "Maaottelut U17-tytöt",
    };

    expect(
      mensTeamCategories(names)
        .map((c) => c.categoryId)
        .sort()
    ).toEqual(["UNL", "WCQ"]);
  });

  it("is empty for a season with no Huuhkajat categories", () => {
    expect(mensTeamCategories({ NA: "Naisten A-maaottelut" })).toEqual([]);
  });

  it("carries each category's display label, so no second lookup is needed", () => {
    expect(mensTeamCategories({ Miehet: "Muut A-maaottelut Huuhkajat" })).toEqual([
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

describe("playedYear", () => {
  it("reads the year in Finnish local time", () => {
    expect(playedYear(new Date("2021-06-12T19:00:00Z"))).toBe(2021);
  });

  /**
   * A late-December kick-off is already the next year in Helsinki, which is
   * the timezone the date column renders in — the section heading and the
   * date beside it must not disagree.
   */
  it("files a late kick-off under the year Helsinki was already in", () => {
    expect(playedYear(new Date("2020-12-31T23:30:00Z"))).toBe(2021);
  });
});

describe("groupByPlayedYear", () => {
  const match = (providerMatchId: number, iso: string) => ({
    providerMatchId,
    kickoffAt: new Date(iso),
  });

  /**
   * The bug this exists to prevent: `maajp18` is one provider bucket holding
   * Euro 2020 qualifying played in 2019, the 2020-21 Nations League played in
   * 2020, and 2021's own matches. Filing all of them under the bucket's
   * nominal season put a 2019 qualifier under a 2021 heading.
   */
  it("splits one bucket's matches across the years they were played in", () => {
    const grouped = groupByPlayedYear([
      match(1, "2019-09-05T19:00:00Z"),
      match(2, "2020-10-11T19:00:00Z"),
      match(3, "2021-06-12T19:00:00Z"),
    ]);

    expect(grouped.map((group) => group.year)).toEqual([2021, 2020, 2019]);
    expect(grouped.map((group) => group.matches.length)).toEqual([1, 1, 1]);
  });

  it("orders years newest first and matches chronologically within one", () => {
    const grouped = groupByPlayedYear([
      match(2, "2021-09-05T19:00:00Z"),
      match(1, "2021-03-05T19:00:00Z"),
      match(3, "2022-03-05T19:00:00Z"),
    ]);

    expect(grouped[0]?.year).toBe(2022);
    expect(grouped[1]?.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("produces no group for a year with no matches", () => {
    expect(groupByPlayedYear([]).map((group) => group.year)).toEqual([]);
  });
});
