import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefreshRunList } from "@/components/refresh-run-list";
import type { RefreshRunView } from "@/lib/refresh-view";

/**
 * The audit log as an admin reads it, from
 * specs/029-forced-season-refresh.md.
 */

function run(overrides: Partial<RefreshRunView> = {}): RefreshRunView {
  return {
    id: 1,
    source: "taso",
    competitionName: "Veikkausliiga",
    seasonLabel: "2016",
    succeeded: true,
    reason: null,
    matches: { inserted: 1, updated: 2, deleted: 3 },
    groupRows: { inserted: 4, updated: 5, deleted: 6 },
    deductionsChanged: 1,
    runByName: "Miikka",
    createdAt: "2026-09-13T09:00:00.000Z",
    ...overrides,
  };
}

describe("RefreshRunList", () => {
  it("says so when nothing has been refreshed", () => {
    render(<RefreshRunList runs={[]} />);

    expect(screen.getByText("Ei aiempia päivityksiä.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("names every column in Finnish", () => {
    render(<RefreshRunList runs={[run()]} />);

    for (const column of [
      "Aika",
      "Sarja",
      "Kausi",
      "Tulos",
      "Ottelut",
      "Sarjataulukko",
      "Pistevähennyksiä",
      "Tekijä",
    ]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
  });

  it("shows a successful run with its counts", () => {
    render(<RefreshRunList runs={[run()]} />);

    expect(screen.getByText("Onnistui")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 / 3")).toBeInTheDocument();
    expect(screen.getByText("4 / 5 / 6")).toBeInTheDocument();
  });

  it("spells the counts out for a screen reader", () => {
    // `1 / 2 / 3` is scannable down a column and meaningless read aloud.
    render(<RefreshRunList runs={[run()]} />);

    expect(screen.getByText("1 uutta, 2 muuttunutta, 3 poistettua")).toBeInTheDocument();
  });

  it("shows a failure with the reason in the same words the form uses", () => {
    render(<RefreshRunList runs={[run({ succeeded: false, reason: "empty" })]} />);

    expect(screen.getByText("Epäonnistui")).toBeInTheDocument();
    expect(screen.getByText("Palvelu ei palauttanut tälle kaudelle mitään.")).toBeInTheDocument();
  });

  it.each([
    ["cache", "Välimuistia ei voitu tyhjentää."],
    ["provider", "Palvelu ei vastannut."],
    ["read", "Tallennettujen tietojen luku epäonnistui."],
    ["write", "Tallennus epäonnistui."],
    ["input", "Pyyntö oli virheellinen."],
    ["stale", "Tiedot muuttuivat haun jälkeen."],
  ] as const)("explains the %s failure", (reason, message) => {
    render(<RefreshRunList runs={[run({ succeeded: false, reason })]} />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("shows a dash where a provider has no group standings at all", () => {
    // Null means the table does not exist for this provider — a different
    // statement from three zeroes, which would claim nothing changed.
    render(<RefreshRunList runs={[run({ source: "football-data", groupRows: null })]} />);

    expect(screen.getByText("Ei sarjataulukkoa")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("names a deleted operator without naming the person", () => {
    render(<RefreshRunList runs={[run({ runByName: null })]} />);

    expect(screen.getByText("Poistettu käyttäjä")).toBeInTheDocument();
  });

  it("formats the time in Helsinki, as the rest of the admin area does", () => {
    render(<RefreshRunList runs={[run()]} />);

    const row = screen.getAllByRole("row")[1];
    expect(row).toBeDefined();
    // 09:00 UTC is 12:00 in Helsinki in September.
    expect(within(row as HTMLElement).getByText(/13\.9\.2026.*12[.:]00/)).toBeInTheDocument();
  });

  it("renders one row per run", () => {
    render(<RefreshRunList runs={[run({ id: 1 }), run({ id: 2 }), run({ id: 3 })]} />);

    // Three runs plus the header row.
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
});
