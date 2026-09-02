import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";

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
});
