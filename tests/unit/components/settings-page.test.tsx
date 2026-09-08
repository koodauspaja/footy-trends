import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Device, type RegionOptions, SettingsPage } from "@/components/settings-page";
import { NO_PREFERENCES, type Preferences } from "@/lib/regions";

const { refetch } = vi.hoisted(() => ({ refetch: vi.fn(async () => {}) }));

const { saveSettings, signOutOtherDevices, deleteAccount } = vi.hoisted(() => ({
  saveSettings: vi.fn(async () => ({ ok: true })),
  signOutOtherDevices: vi.fn(async () => ({ ok: true })),
  deleteAccount: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/settings-actions", () => ({ saveSettings, signOutOtherDevices, deleteAccount }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ refetch }) }));

const REGION_OPTIONS: RegionOptions[] = [
  {
    region: "kotimaa",
    label: "Kotimaan oletussarja",
    fallbackLabel: "Oletus (Veikkausliiga)",
    options: [
      { code: "VL", name: "Veikkausliiga" },
      { code: "M1L", name: "Ykkösliiga" },
    ],
  },
  {
    region: "ulkomaat",
    label: "Ulkomaiden oletussarja",
    fallbackLabel: "Oletus (Valioliiga)",
    options: [{ code: "PL", name: "Valioliiga" }],
  },
  {
    region: "maajoukkueet",
    label: "Maajoukkueiden oletuskilpailu",
    fallbackLabel: "Oletus (MM-kisat)",
    options: [{ code: "WC", name: "MM-kisat" }],
  },
];

const THIS_DEVICE: Device = {
  id: "a",
  description: "Chrome-selain",
  lastUsed: "Käytetty tänään",
  current: true,
};
const OTHER_DEVICE: Device = {
  id: "b",
  description: "Safari-selain",
  lastUsed: "Käytetty eilen",
  current: false,
};

function renderPage(
  preferences: Preferences = NO_PREFERENCES,
  devices: Device[] | null = [THIS_DEVICE]
) {
  return render(
    <SettingsPage devices={devices} preferences={preferences} regionOptions={REGION_OPTIONS} />
  );
}

beforeEach(() => {
  saveSettings.mockClear();
  saveSettings.mockResolvedValue({ ok: true });
  signOutOtherDevices.mockClear();
  signOutOtherDevices.mockResolvedValue({ ok: true });
  deleteAccount.mockClear();
  deleteAccount.mockResolvedValue({ ok: true });
  refetch.mockClear();
  refetch.mockResolvedValue(undefined);
});

describe("preferences", () => {
  it("offers an unset value for every preference", () => {
    // Nothing here may be a one-way door: each setting can be returned to the
    // app's stock behaviour.
    renderPage();

    expect(screen.getByRole("option", { name: "Kysy joka kerta" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Oletus (Veikkausliiga)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Oletus (Valioliiga)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Oletus (MM-kisat)" })).toBeInTheDocument();
  });

  it("selects the unset option when nothing is stored", () => {
    renderPage();

    expect(screen.getByLabelText("Mistä sovellus aloittaa")).toHaveValue("");
    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("");
  });

  it("shows what the reader previously chose", () => {
    renderPage({
      ...NO_PREFERENCES,
      defaultRegion: "kotimaa",
      defaultCompetitionDomestic: "M1L",
    });

    expect(screen.getByLabelText("Mistä sovellus aloittaa")).toHaveValue("kotimaa");
    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("M1L");
  });

  it("offers only that region's competitions in its select", () => {
    renderPage();

    const domestic = screen.getByLabelText("Kotimaan oletussarja");
    expect(domestic).toContainHTML("Ykkösliiga");
    expect(domestic).not.toContainHTML("Valioliiga");
  });

  it("confirms a save in Finnish", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(await screen.findByText("Asetukset tallennettu.")).toBeInTheDocument();
  });

  it("pushes a saved start region into the mounted session", async () => {
    // The start region rides on the session payload, and the header and front
    // page act on it. Without this the setting appears to do nothing until a
    // full reload.
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("says the save landed but needs a reload when the session refresh fails", async () => {
    // The save did succeed, so reporting a failure would be wrong. But the
    // start region will not take effect until the session is re-read, and a
    // silently stale header is worse than saying so.
    refetch.mockRejectedValue(new Error("network"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    expect(
      await screen.findByText(
        "Asetukset tallennettu. Päivitä sivu, jotta muutokset tulevat voimaan."
      )
    ).toBeInTheDocument();
  });

  it("does not refresh the session when the save failed", async () => {
    saveSettings.mockResolvedValue({ ok: false });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    await screen.findByText("Asetusten tallentaminen epäonnistui. Yritä uudelleen.");
    expect(refetch).not.toHaveBeenCalled();
  });

  it("reports a failed save rather than pretending it worked", async () => {
    saveSettings.mockResolvedValue({ ok: false });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    expect(
      await screen.findByText("Asetusten tallentaminen epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("signed-in devices", () => {
  it("marks the current device and never shows an IP address", () => {
    renderPage(NO_PREFERENCES, [THIS_DEVICE, OTHER_DEVICE]);

    expect(screen.getByText("Chrome-selain")).toBeInTheDocument();
    expect(screen.getByText("Tämä laite")).toBeInTheDocument();
    // Location-revealing, and pages get screenshotted.
    expect(document.body.textContent).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("hides the button when there is nothing else to sign out", () => {
    renderPage(NO_PREFERENCES, [THIS_DEVICE]);

    expect(screen.getByText("Olet kirjautunut sisään vain tällä laitteella.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Kirjaa ulos muut laitteet" })
    ).not.toBeInTheDocument();
  });

  it("says the list is unknown rather than claiming there is only one device", () => {
    // "Olet kirjautunut sisään vain tällä laitteella" is a claim about the
    // reader's account security. A failed request cannot support it, and
    // stating it would hide the very sessions this section exists to reveal.
    renderPage(NO_PREFERENCES, null);

    expect(screen.getByText("Laitelistaa ei voitu ladata.")).toBeInTheDocument();
    expect(
      screen.queryByText("Olet kirjautunut sisään vain tällä laitteella.")
    ).not.toBeInTheDocument();
  });

  it("still offers to sign other devices out when the list is unknown", () => {
    // Revoking works whether or not we could enumerate them, and a reader who
    // suspects something is wrong should not be left without the control.
    renderPage(NO_PREFERENCES, null);

    expect(screen.getByRole("button", { name: "Kirjaa ulos muut laitteet" })).toBeInTheDocument();
  });

  it("signs the other devices out", async () => {
    renderPage(NO_PREFERENCES, [THIS_DEVICE, OTHER_DEVICE]);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaa ulos muut laitteet" }));

    await waitFor(() => expect(signOutOtherDevices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Muut laitteet kirjattu ulos.")).toBeInTheDocument();
  });

  it("reports a failed sign-out", async () => {
    signOutOtherDevices.mockResolvedValue({ ok: false });
    renderPage(NO_PREFERENCES, [THIS_DEVICE, OTHER_DEVICE]);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaa ulos muut laitteet" }));

    expect(
      await screen.findByText("Uloskirjaus epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("deleting the account", () => {
  const typeConfirmation = (value: string) =>
    fireEvent.change(screen.getByLabelText("Vahvistus"), { target: { value } });

  it("keeps the button disabled until the word is exact", () => {
    renderPage();
    const button = screen.getByRole("button", { name: "Poista tili" });

    expect(button).toBeDisabled();

    typeConfirmation("POIST");
    expect(button).toBeDisabled();

    typeConfirmation("POISTA");
    expect(button).toBeEnabled();
  });

  it.each([
    ["lowercase", "poista"],
    ["mixed case", "Poista"],
    ["another word", "DELETE"],
  ])("stays disabled for %s", (_case, value) => {
    // The friction is the point: there is no undo and no recovery window.
    renderPage();
    typeConfirmation(value);

    expect(screen.getByRole("button", { name: "Poista tili" })).toBeDisabled();
  });

  it("accepts the word with surrounding whitespace", () => {
    renderPage();
    typeConfirmation("  POISTA  ");

    expect(screen.getByRole("button", { name: "Poista tili" })).toBeEnabled();
  });

  it("reports a failed deletion instead of pretending the account is gone", async () => {
    deleteAccount.mockResolvedValue({ ok: false });
    renderPage();
    typeConfirmation("POISTA");

    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));

    expect(
      await screen.findByText("Tilin poistaminen epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });

  it("leaves for the front page once the account is gone", async () => {
    // A full load, not a client navigation: the account no longer exists, so
    // every trace of the session has to go with it.
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return "http://localhost/asetukset";
        },
        set href(value: string) {
          assign(value);
        },
      },
    });

    renderPage();
    typeConfirmation("POISTA");
    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});

describe("a server action that rejects before returning anything", () => {
  // The actions return `{ ok: false }` for their own failures, but the
  // invocation can reject on its own — a dropped connection never reaches
  // their `try`. Uncaught, that leaves a dead control and an unhandled
  // rejection.
  const typeConfirmation = (value: string) =>
    fireEvent.change(screen.getByLabelText("Vahvistus"), { target: { value } });

  it("still reports a failed save", async () => {
    saveSettings.mockRejectedValue(new Error("transport"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));

    expect(
      await screen.findByText("Asetusten tallentaminen epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });

  it("still reports a failed sign-out of other devices", async () => {
    signOutOtherDevices.mockRejectedValue(new Error("transport"));
    renderPage(NO_PREFERENCES, [THIS_DEVICE, OTHER_DEVICE]);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaa ulos muut laitteet" }));

    expect(
      await screen.findByText("Uloskirjaus epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });

  it("still reports a failed deletion, and does not navigate away", async () => {
    // Sending the reader to `/` as though the account were gone would be the
    // worst possible outcome here.
    deleteAccount.mockRejectedValue(new Error("transport"));
    renderPage();
    typeConfirmation("POISTA");

    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));

    expect(
      await screen.findByText("Tilin poistaminen epäonnistui. Yritä uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("a dropdown after the server sends the saved value back", () => {
  /**
   * #271: the selects were uncontrolled, so `defaultValue` applied on mount and
   * was ignored on every later render. After a save the server revalidates and
   * sends the stored preferences back as new props — and the dropdown kept
   * showing the old value beside `Asetukset tallennettu.`
   */
  it("shows a newly saved competition", () => {
    const { rerender } = renderPage();
    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("");

    rerender(
      <SettingsPage
        devices={[THIS_DEVICE]}
        preferences={{ ...NO_PREFERENCES, defaultCompetitionDomestic: "M1L" }}
        regionOptions={REGION_OPTIONS}
      />
    );

    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("M1L");
  });

  it("shows a newly saved start region", () => {
    // All four selects had the same defect, not only the one reported.
    const { rerender } = renderPage();

    rerender(
      <SettingsPage
        devices={[THIS_DEVICE]}
        preferences={{ ...NO_PREFERENCES, defaultRegion: "kotimaa" }}
        regionOptions={REGION_OPTIONS}
      />
    );

    expect(screen.getByLabelText("Mistä sovellus aloittaa")).toHaveValue("kotimaa");
  });

  it("shows a preference that was cleared back to the default", () => {
    // Unsetting has to travel the same path as setting.
    const { rerender } = render(
      <SettingsPage
        devices={[THIS_DEVICE]}
        preferences={{ ...NO_PREFERENCES, defaultCompetitionDomestic: "M1L" }}
        regionOptions={REGION_OPTIONS}
      />
    );
    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("M1L");

    rerender(
      <SettingsPage
        devices={[THIS_DEVICE]}
        preferences={NO_PREFERENCES}
        regionOptions={REGION_OPTIONS}
      />
    );

    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("");
  });

  it("does not discard an edit the reader has not saved yet", () => {
    // The other half of the fix: a re-render that does not change the *stored*
    // value must leave a half-made choice alone. Otherwise picking a
    // competition and then having the page re-render for any reason would
    // silently undo it.
    //
    // `rerender`, not a second `renderPage()`. Mounting a second component
    // would leave the first one untouched and assert on that — which passes
    // whatever the component does on re-render, and so tests nothing.
    const { rerender } = renderPage();
    fireEvent.change(screen.getByLabelText("Kotimaan oletussarja"), { target: { value: "M1L" } });

    // The same stored preferences, new object identity — what a re-render for
    // any unrelated reason looks like.
    rerender(
      <SettingsPage
        devices={[THIS_DEVICE]}
        preferences={{ ...NO_PREFERENCES }}
        regionOptions={REGION_OPTIONS}
      />
    );

    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("M1L");
  });
});
