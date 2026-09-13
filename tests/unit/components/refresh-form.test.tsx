import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshForm } from "@/components/refresh-form";
import { NO_CHANGES, type RefreshPreview } from "@/lib/refresh-view";

/**
 * The forced refresh as an admin drives it, from
 * specs/029-forced-season-refresh.md.
 *
 * The actions are mocked: what matters here is that **nothing applies without a
 * confirmation**, and that every refusal the engine can report reaches the
 * admin in Finnish rather than as silence.
 */
const { seasonsAction, previewAction, applyAction, state } = vi.hoisted(() => {
  const state = {
    seasons: { ok: true, seasons: [{ seasonId: 2026, label: "2026" }] } as unknown,
    preview: null as unknown,
    apply: null as unknown,
  };
  return {
    state,
    seasonsAction: vi.fn(async () => state.seasons),
    previewAction: vi.fn(async () => state.preview),
    applyAction: vi.fn(async () => state.apply),
  };
});

vi.mock("@/lib/refresh-actions", () => ({
  seasonsForCompetitionAction: seasonsAction,
  previewRefreshAction: previewAction,
  applyRefreshAction: applyAction,
}));

function preview(overrides: Partial<RefreshPreview> = {}): RefreshPreview {
  return {
    source: "taso",
    competitionCode: "VL",
    competitionName: "Veikkausliiga",
    seasonId: 2026,
    seasonLabel: "2026",
    matches: { inserted: 1, updated: 0, deleted: 0 },
    groupRows: NO_CHANGES,
    deductionChanges: [],
    removedMatches: [],
    snapshotHash: "hash-1",
    ...overrides,
  };
}

const DOMESTIC = [
  { value: "taso:VL", label: "Veikkausliiga", source: "taso" as const },
  { value: "taso:M1L", label: "Ykkösliiga", source: "taso" as const },
];
const FOREIGN = [
  { value: "football-data:PL", label: "Valioliiga", source: "football-data" as const },
];

function renderForm() {
  return render(<RefreshForm domestic={DOMESTIC} foreign={FOREIGN} />);
}

/** The season list loads on mount; most assertions need it settled first. */
async function renderLoaded() {
  renderForm();
  await waitFor(() => expect(screen.getByLabelText("Kausi")).toBeEnabled());
}

beforeEach(() => {
  state.seasons = { ok: true, seasons: [{ seasonId: 2026, label: "2026" }] };
  state.preview = { ok: true, preview: preview() };
  state.apply = { ok: true, applied: preview() };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe("the competition picker", () => {
  it("groups the competitions by region, in Finnish", async () => {
    await renderLoaded();

    expect(screen.getByRole("group", { name: "Kotimaa" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ulkomaat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Veikkausliiga" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Valioliiga" })).toBeInTheDocument();
  });

  it("loads the seasons for the competition that is chosen", async () => {
    await renderLoaded();
    seasonsAction.mockClear();

    fireEvent.change(screen.getByLabelText("Sarja"), { target: { value: "football-data:PL" } });

    await waitFor(() => expect(seasonsAction).toHaveBeenCalledWith("football-data:PL"));
  });
});

describe("nothing to pick", () => {
  it("offers no controls when there are no competitions at all", async () => {
    // Not a state this app can reach — both registries are non-empty
    // literals — but the component's own contract has to hold for it rather
    // than reach into an empty array.
    render(<RefreshForm domestic={[]} foreign={[]} />);

    expect(seasonsAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Kausi")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hae muutokset" })).toBeDisabled();
  });
});

describe("the season picker", () => {
  it("sends the season that was chosen, not the one that was default", async () => {
    state.seasons = {
      ok: true,
      seasons: [
        { seasonId: 2026, label: "2026" },
        { seasonId: 2016, label: "2016" },
      ],
    };
    await renderLoaded();

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2016" } });
    fireEvent.click(screen.getByRole("button", { name: "Hae muutokset" }));

    await waitFor(() => expect(previewAction).toHaveBeenCalledWith("taso:VL", 2016));
  });

  it("is disabled until its seasons arrive", () => {
    renderForm();

    expect(screen.getByLabelText("Kausi")).toBeDisabled();
    expect(screen.getByText("Ladataan…")).toBeInTheDocument();
  });

  it("says so when the seasons cannot be loaded, and offers no way to continue", async () => {
    state.seasons = { ok: false, reason: "provider" };
    renderForm();

    await waitFor(() =>
      expect(screen.getAllByText("Kausien haku epäonnistui.").length).toBeGreaterThan(0)
    );
    expect(screen.getByRole("button", { name: "Hae muutokset" })).toBeDisabled();
  });

  it("says so when the season list rejects outright, not only when it refuses", async () => {
    // A thrown action is not the same as one answering `ok: false`, and both
    // have to leave the admin with an explanation rather than a spinner.
    seasonsAction.mockRejectedValueOnce(new Error("network"));
    renderForm();

    await waitFor(() =>
      expect(screen.getAllByText("Kausien haku epäonnistui.").length).toBeGreaterThan(0)
    );
  });

  it("says so when the app holds no seasons for this competition", async () => {
    // Not a failure: the tool corrects seasons we hold, and there are none.
    state.seasons = { ok: true, seasons: [] };
    renderForm();

    await waitFor(() =>
      expect(screen.getByText("Tälle sarjalle ei ole tallennettuja kausia.")).toBeInTheDocument()
    );
  });
});

describe("a slow season list", () => {
  it("ignores one that arrives after the competition changed", async () => {
    // Otherwise the first competition's seasons overwrite the second's, and the
    // form offers seasons belonging to a competition nobody selected.
    let resolveFirst: (value: unknown) => void = () => undefined;
    seasonsAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    seasonsAction.mockResolvedValueOnce({
      ok: true,
      seasons: [{ seasonId: 1999, label: "1999" }],
    });

    renderForm();
    fireEvent.change(screen.getByLabelText("Sarja"), { target: { value: "taso:M1L" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "1999" })).toBeInTheDocument());

    await act(async () => {
      resolveFirst({ ok: true, seasons: [{ seasonId: 2026, label: "2026" }] });
    });

    expect(screen.queryByRole("option", { name: "2026" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1999" })).toBeInTheDocument();
  });

  it("ignores one that rejects after the component is gone", async () => {
    let rejectFirst: (reason: unknown) => void = () => undefined;
    seasonsAction.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
    );

    const { unmount } = renderForm();
    unmount();

    // No state update, and nothing thrown: the effect's cleanup has already
    // said this answer is no longer wanted.
    await act(async () => {
      rejectFirst(new Error("too late"));
    });
  });
});

describe("previewing", () => {
  it("writes nothing on its own — it only asks", async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Hae muutokset" }));

    await waitFor(() => expect(previewAction).toHaveBeenCalledWith("taso:VL", 2026));
    expect(applyAction).not.toHaveBeenCalled();
  });

  it("opens the confirmation with what would change", async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Hae muutokset" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Näin tiedot muuttuisivat" })).toBeInTheDocument()
    );
    expect(screen.getByText("Uusia otteluita: 1")).toBeInTheDocument();
  });

  it.each([
    ["input", "Tuntematon sarja tai kausi."],
    [
      "cache",
      "Välimuistia ei voitu tyhjentää, joten haku olisi palauttanut vanhaa tietoa. Mitään ei haettu.",
    ],
    ["provider", "Haku epäonnistui. Palvelu ei vastannut. Tallennetut tiedot jäivät ennalleen."],
    [
      "empty",
      "Palvelu ei palauttanut tälle kaudelle mitään, vaikka tallennettuja rivejä on. Mitään ei muutettu.",
    ],
    ["read", "Tallennettujen tietojen luku epäonnistui. Mitään ei muutettu."],
  ])("reports the %s refusal in Finnish, and opens no dialog", async (reason, message) => {
    state.preview = { ok: false, reason };
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Hae muutokset" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("applying", () => {
  async function openConfirmation() {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Hae muutokset" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  }

  it("sends the hash of the diff that was shown", async () => {
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));

    await waitFor(() => expect(applyAction).toHaveBeenCalledWith("taso:VL", 2026, "hash-1"));
  });

  it("cancelling closes the dialog and applies nothing", async () => {
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(applyAction).not.toHaveBeenCalled();
  });

  it("reports what was written, counts and all", async () => {
    state.apply = {
      ok: true,
      applied: preview({
        matches: { inserted: 1, updated: 2, deleted: 3 },
        groupRows: { inserted: 4, updated: 5, deleted: 6 },
      }),
    };
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Veikkausliiga 2026 päivitetty.")
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Otteluita: 1 uutta, 2 muuttunutta, 3 poistettua."
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sarjataulukkorivejä: 4 uutta, 5 muuttunutta, 6 poistettua."
    );
  });

  it("omits the standings line for a provider that has none", async () => {
    state.preview = { ok: true, preview: preview({ groupRows: null }) };
    state.apply = { ok: true, applied: preview({ groupRows: null }) };
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("päivitetty."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Sarjataulukkorivejä");
  });

  it("re-opens the confirmation with the fresh diff when the data moved", async () => {
    // A stale refusal carries the diff describing what is actually there, so
    // the admin decides again rather than being told to start over.
    state.apply = {
      ok: false,
      reason: "stale",
      preview: preview({ matches: { inserted: 9, updated: 0, deleted: 0 } }),
    };
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Tiedot muuttuivat haun jälkeen. Tarkista muutokset uudelleen."
      )
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Uusia otteluita: 9")).toBeInTheDocument();
  });

  it("closes the dialog when a refusal carries no diff to show", async () => {
    state.apply = { ok: false, reason: "write" };
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Tallennus epäonnistui. Tallennetut tiedot jäivät ennalleen."
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
