import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NicknameSettings } from "@/components/nickname-settings";
import type { SaveNicknameResult } from "@/lib/nickname-actions";

/**
 * The settings page's nickname section: what it shows, what a save says, and
 * each refusal in Finnish.
 *
 * decisions/077-nickname.md
 */

const { saveNicknameAction, reportClientError } = vi.hoisted(() => ({
  saveNicknameAction: vi.fn<(raw: unknown) => Promise<SaveNicknameResult>>(),
  reportClientError: vi.fn(),
}));

vi.mock("@/lib/nickname-actions", () => ({ saveNicknameAction }));
vi.mock("@/lib/report-client-error", () => ({ reportClientError }));

function renderSection(stored: { nickname: string | null } | null = { nickname: null }) {
  return render(
    <NicknameSettings
      buttonClassName="button"
      headingClassName="heading"
      sectionClassName="section"
      stored={stored}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>("Nimimerkki");
}

function save(value: string) {
  fireEvent.change(field(), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Tallenna nimimerkki" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  saveNicknameAction.mockResolvedValue({ ok: true, nickname: "Kalle Kukko" });
});

describe("NicknameSettings", () => {
  it("says who sees the nickname", () => {
    renderSection();

    expect(
      screen.getByText(
        "Nimimerkki näkyy muille kirjautuneille käyttäjille arvauspelin tulostaulukossa."
      )
    ).toBeInTheDocument();
  });

  it("shows the stored nickname, or an empty field when there is none", () => {
    renderSection({ nickname: "Kalle" });
    expect(field()).toHaveValue("Kalle");
  });

  it("starts empty for a user with none", () => {
    renderSection();
    expect(field()).toHaveValue("");
  });

  it("says the nickname could not be read, and offers no field, when the read failed", () => {
    renderSection(null);

    expect(screen.getByText("Nimimerkkiä ei voitu ladata.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nimimerkki")).not.toBeInTheDocument();
  });

  it("sends what was typed and shows the stored form back", async () => {
    renderSection();
    save("  Kalle   Kukko ");

    expect(await screen.findByText("Nimimerkki tallennettu.")).toBeInTheDocument();
    expect(saveNicknameAction).toHaveBeenCalledWith("  Kalle   Kukko ");
    expect(field()).toHaveValue("Kalle Kukko");
  });

  it("says the nickname was removed when it was saved empty", async () => {
    saveNicknameAction.mockResolvedValue({ ok: true, nickname: null });
    renderSection({ nickname: "Kalle" });
    save("");

    expect(await screen.findByText("Nimimerkki poistettu.")).toBeInTheDocument();
    expect(field()).toHaveValue("");
  });

  it.each([
    ["length", "Nimimerkin pituus on 3–20 merkkiä."],
    [
      "characters",
      "Nimimerkissä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _ ja .",
    ],
    ["taken", "Nimimerkki on jo käytössä."],
    ["word-list", "Valitse toinen nimimerkki."],
    ["failed", "Nimimerkin tallentaminen epäonnistui. Yritä uudelleen."],
  ] as const)("phrases the refusal %s under the field", async (reason, text) => {
    saveNicknameAction.mockResolvedValue({ ok: false, reason });
    renderSection();
    save("Kalle");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(field()).toHaveAttribute("aria-describedby", alert.id);
    expect(field()).toHaveValue("Kalle");
  });

  it("marks the field invalid for a rule it broke, not for a failed save", async () => {
    saveNicknameAction.mockResolvedValue({ ok: false, reason: "taken" });
    renderSection();
    save("Kalle");
    await screen.findByRole("alert");
    expect(field()).toHaveAttribute("aria-invalid", "true");

    saveNicknameAction.mockResolvedValue({ ok: false, reason: "failed" });
    save("Kalle B");
    await waitFor(() => expect(saveNicknameAction).toHaveBeenCalledTimes(2));
    await screen.findByText("Nimimerkin tallentaminen epäonnistui. Yritä uudelleen.");
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });

  it("clears a refusal once the field is edited", async () => {
    saveNicknameAction.mockResolvedValue({ ok: false, reason: "taken" });
    renderSection();
    save("Kalle");
    await screen.findByRole("alert");

    fireEvent.change(field(), { target: { value: "Kalle B" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-describedby");
  });

  it("reports an action that rejects, and says the save failed", async () => {
    const error = new Error("network");
    saveNicknameAction.mockRejectedValue(error);
    renderSection();
    save("Kalle");

    expect(
      await screen.findByText("Nimimerkin tallentaminen epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(error, "nickname.save");
  });

  it("disables the button while a save is pending", async () => {
    let finish: (result: SaveNicknameResult) => void = () => {};
    saveNicknameAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderSection();
    save("Kalle");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tallenna nimimerkki" })).toBeDisabled()
    );
    finish({ ok: true, nickname: "Kalle" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tallenna nimimerkki" })).toBeEnabled()
    );
  });
});
