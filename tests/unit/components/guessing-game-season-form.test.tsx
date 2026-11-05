import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formTeams, SeasonGuessForm } from "@/components/guessing-game-season-form";
import type { SeasonKind } from "@/lib/guessing-game-season";

/**
 * A season guess form as a player uses it: a team, six teams or the whole
 * table, sent only once it is a whole guess, each kind's own button, and each
 * refusal the server gives shown in Finnish under it.
 *
 * decisions/075-season-guesses.md
 */

const { placeSeasonGuessAction, refresh, reportClientError } = vi.hoisted(() => ({
  placeSeasonGuessAction: vi.fn(),
  refresh: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock("@/lib/guessing-game-actions", () => ({ placeSeasonGuessAction }));
vi.mock("@/lib/report-client-error", () => ({ reportClientError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const TEAMS = Array.from({ length: 12 }, (_, index) => ({
  teamProviderId: 100 + index,
  name: `Team ${100 + index}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderForm(kind: SeasonKind, guess: readonly number[] | null = null) {
  return render(<SeasonGuessForm guess={guess} kind={kind} label="Mestari" teams={TEAMS} />);
}

function choose(select: HTMLElement, team: number) {
  fireEvent.change(select, { target: { value: String(team) } });
}

describe("formTeams", () => {
  it("is a whole guess only with as many distinct teams as the kind names", () => {
    expect(formTeams("champion", [100])).toEqual([100]);
    expect(formTeams("champion", [null])).toBeNull();
    expect(formTeams("upper", [1, 2, 3, 4, 5])).toBeNull();
    expect(formTeams("upper", [1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(formTeams("table", [1, 1, ...Array.from({ length: 10 }, (_, i) => i + 2)])).toBeNull();
  });
});

describe("SeasonGuessForm", () => {
  it("sends a champion and refreshes the page", async () => {
    placeSeasonGuessAction.mockResolvedValue({ ok: true });
    renderForm("champion");
    const button = screen.getByRole("button", { name: "Arvaa mestari" });

    expect(button).toBeDisabled();
    choose(screen.getByRole("combobox"), 103);
    fireEvent.click(button);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(placeSeasonGuessAction).toHaveBeenCalledWith({ kind: "champion", teams: [103] });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can choose no team again, which is no guess", () => {
    renderForm("last");
    const select = screen.getByRole("combobox");
    choose(select, 103);
    fireEvent.change(select, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Arvaa putoaja" })).toBeDisabled();
  });

  it("names each kind's button, before a guess and after one", () => {
    const names: Array<[SeasonKind, string, string]> = [
      ["champion", "Arvaa mestari", "Muuta mestaria"],
      ["upper", "Arvaa joukkueet", "Muuta joukkueita"],
      ["last", "Arvaa putoaja", "Muuta putoajaa"],
      ["table", "Arvaa sarjataulukko", "Muuta sarjataulukkoa"],
    ];
    for (const [kind, place, change] of names) {
      const placing = renderForm(kind);
      expect(screen.getByRole("button", { name: place })).toBeInTheDocument();
      placing.unmount();
      const changing = renderForm(kind, [100]);
      expect(screen.getByRole("button", { name: change })).toBeInTheDocument();
      changing.unmount();
    }
  });

  it("sends the six only once exactly six are chosen", async () => {
    placeSeasonGuessAction.mockResolvedValue({ ok: true });
    renderForm("upper");
    const button = screen.getByRole("button", { name: "Arvaa joukkueet" });
    const boxes = screen.getAllByRole("checkbox");

    expect(screen.getByText("Valitse kuusi joukkuetta.")).toBeInTheDocument();
    for (const box of boxes.slice(0, 7)) fireEvent.click(box);
    expect(button).toBeDisabled();
    fireEvent.click(boxes[0] as HTMLElement);
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() =>
      expect(placeSeasonGuessAction).toHaveBeenCalledWith({
        kind: "upper",
        teams: [101, 102, 103, 104, 105, 106],
      })
    );
  });

  it("starts from the player's six, ticked", () => {
    renderForm("upper", [100, 101, 102, 103, 104, 105]);

    expect(
      screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked)
    ).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Muuta joukkueita" })).toBeEnabled();
  });

  it("sends a table of twelve places, and says when a team is chosen twice", async () => {
    placeSeasonGuessAction.mockResolvedValue({ ok: true });
    renderForm("table");
    const selects = screen.getAllByRole("combobox");
    const button = screen.getByRole("button", { name: "Arvaa sarjataulukko" });

    expect(selects).toHaveLength(12);
    expect(screen.getByText("Sija 1")).toBeInTheDocument();
    expect(screen.getByText("Sija 12")).toBeInTheDocument();
    choose(selects[0] as HTMLElement, 100);
    choose(selects[1] as HTMLElement, 100);
    expect(screen.getByText("Jokainen joukkue vain kerran.")).toBeInTheDocument();
    selects.forEach((select, index) => {
      choose(select, 100 + index);
    });
    expect(screen.queryByText("Jokainen joukkue vain kerran.")).toBeNull();
    fireEvent.click(button);

    await waitFor(() =>
      expect(placeSeasonGuessAction).toHaveBeenCalledWith({
        kind: "table",
        teams: TEAMS.map((team) => team.teamProviderId),
      })
    );
  });

  it("starts a table from the player's guess, every place filled", () => {
    renderForm(
      "table",
      TEAMS.map((team) => team.teamProviderId)
    );

    expect((screen.getAllByRole("combobox")[11] as HTMLSelectElement).value).toBe("111");
    expect(screen.getByRole("button", { name: "Muuta sarjataulukkoa" })).toBeEnabled();
  });

  it("says a locked season and refreshes, and says a short balance without refreshing", async () => {
    placeSeasonGuessAction.mockResolvedValueOnce({ ok: false, reason: "insufficient" });
    renderForm("champion");
    choose(screen.getByRole("combobox"), 100);
    fireEvent.click(screen.getByRole("button", { name: "Arvaa mestari" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pelimerkit eivät riitä.");
    expect(refresh).not.toHaveBeenCalled();

    placeSeasonGuessAction.mockResolvedValueOnce({ ok: false, reason: "locked" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Arvaa mestari" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Arvaa mestari" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Kauden arvaukset ovat lukittuneet.")
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("says a failure to retry when the server refuses otherwise or the call throws, and reports a throw", async () => {
    placeSeasonGuessAction.mockResolvedValueOnce({ ok: false, reason: "failed" });
    renderForm("champion");
    choose(screen.getByRole("combobox"), 100);
    fireEvent.click(screen.getByRole("button", { name: "Arvaa mestari" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arvausta ei voitu tallentaa. Yritä uudelleen."
    );

    placeSeasonGuessAction.mockRejectedValueOnce(new Error("network"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Arvaa mestari" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Arvaa mestari" }));

    await waitFor(() =>
      expect(reportClientError).toHaveBeenCalledWith(
        expect.any(Error),
        "guessing-game.season-guess"
      )
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Arvausta ei voitu tallentaa.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends nothing while the guess is not whole", () => {
    renderForm("champion");

    fireEvent.submit(
      screen.getByRole("button", { name: "Arvaa mestari" }).closest("form") as HTMLElement
    );

    expect(placeSeasonGuessAction).not.toHaveBeenCalled();
  });
});
