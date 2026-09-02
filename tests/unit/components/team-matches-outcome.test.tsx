import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamMatchesOutcome, type TeamOutcome } from "@/components/team-matches-outcome";

const base: TeamOutcome = {
  result: "not_found",
  seasons: "ok",
  seasonLabel: "2026",
  sameSeason: [],
  newest: null,
};

function renderOutcome(outcome: Partial<TeamOutcome>) {
  render(
    <TeamMatchesOutcome outcome={{ ...base, ...outcome }} table={<table aria-label="matches" />} />
  );
}

describe("TeamMatchesOutcome", () => {
  it("shows the match list when there are matches", () => {
    renderOutcome({ result: "ok" });

    expect(screen.getByLabelText("matches")).toBeInTheDocument();
  });

  it("says the club played elsewhere, and where", () => {
    renderOutcome({
      sameSeason: [{ label: "Ykkösliiga", href: "/kotimaa/joukkue/1?kilpailu=M1L&kausi=2026" }],
    });

    expect(
      screen.getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ykkösliiga" })).toBeInTheDocument();
  });

  it("offers the club's most recent season when it played nothing that year", () => {
    renderOutcome({
      newest: { label: "Ykkösliiga 2026", href: "/kotimaa/joukkue/1?kilpailu=M1L&kausi=2026" },
    });

    expect(screen.getByText(/Joukkueen uusin kausi/)).toBeInTheDocument();
  });

  it("calls a club unknown only when nothing is stored for it", () => {
    renderOutcome({ seasons: "not_found" });

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
  });

  it("reports a failed lookup as a failure, not as an unknown club", () => {
    renderOutcome({ seasons: "error" });

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
  });

  it("keeps the match list's own verdict ahead of the club's other lookups", () => {
    // `empty` is only returned when the refresh succeeded, so "this season holds
    // no matches" stays true even if the club's seasons could not be read.
    // Reporting an outage here would be less accurate, not more.
    renderOutcome({ result: "empty", seasons: "error" });

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("reports the match list's own failure as a failure", () => {
    renderOutcome({ result: "error", seasons: "ok" });

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });
});
