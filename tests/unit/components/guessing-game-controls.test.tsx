import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuessForm, JoinGameButton } from "@/components/guessing-game-controls";

/**
 * Arvauspeli's controls as a player uses them: joining, choosing a 1X2 or a
 * score, sending only a whole guess that changes something, and each refusal
 * the server gives shown in Finnish under the row.
 *
 * decisions/072-match-guesses.md
 */

const { joinGameAction, placeGuessAction, refresh, reportClientError } = vi.hoisted(() => ({
  joinGameAction: vi.fn(),
  placeGuessAction: vi.fn(),
  refresh: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock("@/lib/guessing-game-actions", () => ({ joinGameAction, placeGuessAction }));
vi.mock("@/lib/report-client-error", () => ({ reportClientError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JoinGameButton", () => {
  it("joins and refreshes the page", async () => {
    joinGameAction.mockResolvedValue({ ok: true });
    render(<JoinGameButton />);

    fireEvent.click(screen.getByRole("button", { name: "Liity peliin" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when joining failed, refused or thrown", async () => {
    joinGameAction.mockResolvedValueOnce({ ok: false });
    render(<JoinGameButton />);
    fireEvent.click(screen.getByRole("button", { name: "Liity peliin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Liittyminen epäonnistui. Yritä uudelleen."
    );

    joinGameAction.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Liity peliin" }));
    await waitFor(() =>
      expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), "guessing-game.join")
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

function renderForm(props: Partial<Parameters<typeof GuessForm>[0]> = {}) {
  return render(
    <GuessForm
      awayTeamName="KuPS"
      floor={false}
      guess={null}
      homeTeamName="HJK"
      providerMatchId={7}
      {...props}
    />
  );
}

describe("GuessForm", () => {
  it("sends a 1X2 guess and refreshes the page", async () => {
    placeGuessAction.mockResolvedValue({ ok: true });
    renderForm();

    expect(screen.getByRole("button", { name: "Arvaa" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "X" }));
    fireEvent.click(screen.getByRole("button", { name: "Arvaa" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(placeGuessAction).toHaveBeenCalledWith(7, { kind: "outcome", outcome: "X" });
  });

  it("sends a score only once both sides are whole goal counts", async () => {
    placeGuessAction.mockResolvedValue({ ok: true });
    renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "Arvaa tulos" }));
    const button = screen.getByRole("button", { name: "Arvaa" });
    fireEvent.change(screen.getByLabelText("HJK, maalit"), { target: { value: "2" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("KuPS, maalit"), { target: { value: "100" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("KuPS, maalit"), { target: { value: "1.5" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("KuPS, maalit"), { target: { value: "1" } });
    fireEvent.click(button);

    await waitFor(() =>
      expect(placeGuessAction).toHaveBeenCalledWith(7, {
        kind: "score",
        homeGoals: 2,
        awayGoals: 1,
      })
    );
  });

  it("opens on the stored guess, offers a change, and sends nothing until it differs", async () => {
    placeGuessAction.mockResolvedValue({ ok: true });
    renderForm({ guess: { kind: "score", homeGoals: 3, awayGoals: 0 } });

    expect(screen.getByRole("radio", { name: "Arvaa tulos" })).toBeChecked();
    expect(screen.getByLabelText("HJK, maalit")).toHaveValue(3);
    const button = screen.getByRole("button", { name: "Muuta arvausta" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    fireEvent.click(button);

    await waitFor(() =>
      expect(placeGuessAction).toHaveBeenCalledWith(7, { kind: "outcome", outcome: "1" })
    );
  });

  it("offers no score on the floor's free guess", () => {
    renderForm({ floor: true });

    expect(screen.queryByRole("radio", { name: "Arvaa tulos" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows each refusal in Finnish under the row", async () => {
    renderForm({ guess: { kind: "outcome", outcome: "2" } });
    const messages = {
      started: "Ottelu on jo alkanut.",
      insufficient: "Pelimerkit eivät riitä.",
      "free-fixed": "Maksutonta arvausta ei voi muuttaa.",
      failed: "Arvausta ei voitu tallentaa. Yritä uudelleen.",
    };
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    for (const [reason, message] of Object.entries(messages)) {
      placeGuessAction.mockResolvedValueOnce({ ok: false, reason });
      fireEvent.click(screen.getByRole("button", { name: "Muuta arvausta" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    }
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a thrown call and tells the player to retry", async () => {
    placeGuessAction.mockRejectedValue(new Error("network"));
    renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Arvaa" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arvausta ei voitu tallentaa. Yritä uudelleen."
    );
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), "guessing-game.guess");
  });

  it("does nothing when the form is submitted without a whole guess", () => {
    const { container } = renderForm();

    const form = container.querySelector("form");
    if (form === null) throw new Error("no form");
    fireEvent.submit(form);

    expect(placeGuessAction).not.toHaveBeenCalled();
  });
});
