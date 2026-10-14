import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NO_OPPONENTS_MESSAGE,
  OPPONENTS_ERROR_MESSAGE,
  OPPONENTS_HEADING,
  opponentsPanel,
  THRESHOLD_NOTE,
} from "@/components/opponents-section";
import type { OpponentsSeries } from "@/lib/head-to-head";

/**
 * The `Vaikeimmat vastustajat` panel. Which opponents qualify, and in what
 * order, is `head-to-head.test.ts`'s; this file owns what the panel shows.
 *
 * decisions/045-bogey-teams.md
 */

const WINDOW = "Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.";

const OK: OpponentsSeries = {
  status: "ok",
  rows: [
    {
      opponentProviderId: 2,
      opponentName: "KuPS",
      played: 5,
      wins: 0,
      draws: 2,
      losses: 3,
      pointsPerMatch: 0.4,
      lastMet: new Date("2026-05-01T16:00:00Z"),
      href: "/kotimaa/kohtaamiset/1/2",
    },
    {
      opponentProviderId: 3,
      opponentName: "Ilves",
      played: 3,
      wins: 1,
      draws: 0,
      losses: 2,
      pointsPerMatch: 1,
      lastMet: new Date("2025-08-01T16:00:00Z"),
      href: "/kotimaa/kohtaamiset/1/3",
    },
  ],
  windowSentence: WINDOW,
};

function renderPanel(series: OpponentsSeries) {
  return render(<div>{opponentsPanel(series)}</div>);
}

describe("opponentsPanel", () => {
  it("is no panel at all where it does not apply", () => {
    expect(opponentsPanel({ status: "unavailable" })).toBeNull();
  });

  it("says the opponents could not be counted when the read failed", () => {
    renderPanel({ status: "error" });

    expect(screen.getByRole("heading", { level: 4, name: OPPONENTS_HEADING })).toBeInTheDocument();
    expect(screen.getByText(OPPONENTS_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says so when no opponent has been met three times", () => {
    renderPanel({ status: "ok", rows: [], windowSentence: WINDOW });

    expect(screen.getByText(NO_OPPONENTS_MESSAGE)).toBeInTheDocument();
    expect(NO_OPPONENTS_MESSAGE).toBe("Yhtäkään vastustajaa ei ole kohdattu vähintään 3 kertaa.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("uses the standings table's own headers, with their titles", () => {
    renderPanel(OK);

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Vastustaja", "O", "V", "T", "H", "P/O"]);
    expect(headers.map((h) => h.getAttribute("title"))).toEqual([
      null,
      "Ottelut",
      "Voitot",
      "Tasapelit",
      "Häviöt",
      "Pisteitä ottelua kohden",
    ]);
  });

  it("gives each opponent its record, in the order given, linking to the head-to-head", () => {
    // Every count distinct, so a swapped column cannot pass unnoticed.
    renderPanel(OK);

    const [, first, second] = screen.getAllByRole("row");
    expect(within(first as HTMLElement).getByRole("link", { name: "KuPS" })).toHaveAttribute(
      "href",
      "/kotimaa/kohtaamiset/1/2"
    );
    expect(
      within(first as HTMLElement)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["5", "0", "2", "3", "0,4"]);
    expect(within(second as HTMLElement).getByRole("link", { name: "Ilves" })).toBeInTheDocument();
    expect(
      within(second as HTMLElement)
        .getAllByRole("cell")
        .at(-1)
    ).toHaveTextContent("1,0");
  });

  it("states the threshold and the window the rows are true within", () => {
    renderPanel(OK);

    expect(THRESHOLD_NOTE).toBe("Vähintään 3 kohtaamista.");
    expect(screen.getByText(`${THRESHOLD_NOTE} ${WINDOW}`)).toBeInTheDocument();
  });
});
