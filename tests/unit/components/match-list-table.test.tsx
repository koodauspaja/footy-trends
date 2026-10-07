import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COLUMN_WIDTHS } from "@/components/data-table";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";

/**
 * The match list table: the link to each match, and the score as the match page
 * prints it.
 *
 * decisions/019-match-page.md
 * decisions/021-table-consistency.md
 * decisions/498-match-list-score.md
 */

const rows: MatchListRow[] = [
  {
    providerMatchId: 4036979,
    kickoffAt: new Date("2026-08-31T16:00:00Z"),
    homeTeamProviderId: 60901,
    homeTeamName: "VPS",
    awayTeamProviderId: 60969,
    awayTeamName: "FC Lahti",
    homeGoals: 2,
    awayGoals: 1,
  },
];

describe("MatchListTable match links", () => {
  it("links the date to the match page when a href builder is given", () => {
    render(
      <MatchListTable
        matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
        matches={rows}
        teamHref={null}
      />
    );

    expect(screen.getByRole("link", { name: "31.08.2026" })).toHaveAttribute(
      "href",
      "/kotimaa/ottelu/4036979"
    );
  });

  it("leaves the date as plain text without one", () => {
    render(<MatchListTable matches={rows} teamHref={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("31.08.2026")).toBeInTheDocument();
  });

  it("keeps the team links independent of the date link", () => {
    render(
      <MatchListTable
        matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
        matches={rows}
        teamHref={(teamProviderId) => `/kotimaa/joukkue/${teamProviderId}`}
      />
    );

    expect(screen.getByRole("link", { name: "VPS" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60901"
    );
    expect(screen.getByRole("link", { name: "FC Lahti" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60969"
    );
    expect(screen.getByRole("link", { name: "31.08.2026" })).toBeInTheDocument();
  });

  it("right-aligns a round number and nothing else", () => {
    // A round is a quantity; a date is not, and `2–1` is a pair.
    render(
      <MatchListTable
        fourthColumn={{ header: "Kierros", render: () => 12 }}
        matches={rows}
        teamHref={null}
      />
    );

    expect(screen.getByRole("columnheader", { name: "Kierros" })).toHaveClass("text-right");
    expect(screen.getByRole("columnheader", { name: "Pvm" })).toHaveClass("text-left");
    expect(screen.getByRole("columnheader", { name: "Tulos" })).toHaveClass("text-left");
  });

  it("leaves a series or competition column aligned as the text it is", () => {
    render(
      <MatchListTable
        fourthColumn={{ header: "Kilpailu", render: () => "Veikkausliiga" }}
        matches={rows}
        teamHref={null}
      />
    );

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toHaveClass("text-left");
  });

  it("keeps Pvm and Tulos fixed whether or not a fourth column exists", () => {
    // The flexible `Ottelu` absorbs the difference, which is why a phase with
    // no round number still lines its dates and scores up with one that has it.
    const withFourth = render(
      <MatchListTable
        fourthColumn={{ header: "Sarja", render: () => "Runkosarja" }}
        matches={rows}
        teamHref={null}
      />
    );
    const four = [...withFourth.container.querySelectorAll("col")].map(
      (c) => c.style.width || "flex"
    );
    withFourth.unmount();

    const withoutFourth = render(<MatchListTable matches={rows} teamHref={null} />);
    const three = [...withoutFourth.container.querySelectorAll("col")].map(
      (c) => c.style.width || "flex"
    );

    expect(four).toEqual([
      `${COLUMN_WIDTHS.date}px`,
      "flex",
      `${COLUMN_WIDTHS.score}px`,
      `${COLUMN_WIDTHS.label}px`,
    ]);
    expect(three).toEqual([`${COLUMN_WIDTHS.date}px`, "flex", `${COLUMN_WIDTHS.score}px`]);
  });
});

describe("MatchListTable scores (#498)", () => {
  // Manchester City – Real Madrid, 17.04.2024, as football-data stores it.
  const shootout: MatchListRow = {
    providerMatchId: 438512,
    kickoffAt: new Date("2024-04-17T19:00:00Z"),
    homeTeamProviderId: 65,
    homeTeamName: "Manchester City FC",
    awayTeamProviderId: 86,
    awayTeamName: "Real Madrid CF",
    homeGoals: 4,
    awayGoals: 5,
    regularTimeHome: 1,
    regularTimeAway: 1,
    extraTimeHome: 0,
    extraTimeAway: 0,
    penaltiesHome: 3,
    penaltiesAway: 4,
  };

  function result(match: MatchListRow) {
    render(<MatchListTable matches={[match]} teamHref={null} />);
    return screen.getAllByRole("cell")[2]?.textContent;
  }

  it("prints a shoot-out as the match page does, not its stored total", () => {
    expect(result(shootout)).toBe("1–1 (rp 3–4)");
  });

  it("says when extra time decided a match", () => {
    expect(
      result({
        ...shootout,
        homeGoals: 2,
        awayGoals: 1,
        extraTimeHome: 1,
        extraTimeAway: 0,
        penaltiesHome: null,
        penaltiesAway: null,
      })
    ).toBe("2–1 (ja)");
  });

  it("prints a TASO row, which has no breakdown, as it is stored", () => {
    expect(result(rows[0] as MatchListRow)).toBe("2–1");
  });

  it("prints an unplayed match as a dash", () => {
    expect(result({ ...(rows[0] as MatchListRow), homeGoals: null, awayGoals: null })).toBe("–");
  });
});
