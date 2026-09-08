import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FavouriteCompetitionEntry,
  FavouritesPage,
  type FavouriteTeamEntry,
} from "@/components/favourites-page";

/**
 * `/suosikit`'s list, from specs/026-favourites.md.
 *
 * The two cases worth most here are the ones the rest of the feature cannot
 * show: a competition retired after someone favourited it, and a team with no
 * stored match. Both must stay on the page, because an entry nobody can see is
 * an entry nobody can remove.
 */
const { removeTeam, removeCompetition } = vi.hoisted(() => ({
  removeTeam: vi.fn<(source: string, id: number) => Promise<{ ok: boolean }>>(),
  removeCompetition: vi.fn<(region: string, code: string) => Promise<{ ok: boolean }>>(),
}));

vi.mock("@/lib/favourite-actions", () => ({
  removeFavouriteTeamAction: removeTeam,
  removeFavouriteCompetitionAction: removeCompetition,
}));

const ILVES: FavouriteTeamEntry = {
  source: "taso",
  teamProviderId: 60731,
  name: "Ilves",
  href: "/kotimaa/joukkue/60731",
};

const VEIKKAUSLIIGA: FavouriteCompetitionEntry = {
  region: "kotimaa",
  code: "VL",
  name: "Veikkausliiga",
  href: "/kotimaa/sarjataulukko?kilpailu=VL",
};

function renderPage(
  overrides: { teams?: FavouriteTeamEntry[]; competitions?: FavouriteCompetitionEntry[] } = {}
) {
  return render(
    <FavouritesPage
      competitions={overrides.competitions ?? [VEIKKAUSLIIGA]}
      teams={overrides.teams ?? [ILVES]}
    />
  );
}

const removeButtons = () => screen.getAllByRole("button", { name: "Poista suosikeista" });

/** The remove button in the row for `name` — position would count the other section's rows. */
const removeRow = (name: string) => {
  const row = screen.getByText(name).closest("li");
  if (row === null) throw new Error(`No row for ${name}`);
  return within(row).getByRole("button", { name: "Poista suosikeista" });
};

beforeEach(() => {
  vi.clearAllMocks();
  removeTeam.mockResolvedValue({ ok: true });
  removeCompetition.mockResolvedValue({ ok: true });
});

describe("what it shows", () => {
  it("has a section for each kind, always, so the page never looks broken", () => {
    renderPage({ competitions: [], teams: [] });

    expect(screen.getByRole("heading", { name: "Sarjat" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Joukkueet" })).toBeInTheDocument();
    expect(screen.getByText("Ei suosikkisarjoja. Lisää niitä sarjan sivulta.")).toBeInTheDocument();
    expect(
      screen.getByText("Ei suosikkijoukkueita. Lisää niitä joukkueen sivulta.")
    ).toBeInTheDocument();
  });

  it("links each entry to its own page", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Veikkausliiga" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL"
    );
    expect(screen.getByRole("link", { name: "Ilves" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60731"
    );
  });

  it("keeps a retired competition on the page, and removable", () => {
    renderPage({ competitions: [{ ...VEIKKAUSLIIGA, name: null }] });

    expect(screen.getByText("Sarjaa ei enää ole.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Veikkausliiga" })).not.toBeInTheDocument();
    expect(removeButtons()).toHaveLength(2);
  });

  it("keeps a team with no stored match on the page, and removable", () => {
    renderPage({ teams: [{ ...ILVES, name: null, href: null }] });

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(removeButtons()).toHaveLength(2);
  });

  it("names a team whose page we could not work out, without linking it", () => {
    /**
     * Name but no href: we know who it is, but not which region's page it
     * belongs to — its competitions have left the registry. Saying
     * `Joukkuetta ei löytynyt.` here would be false about a team we just
     * named, and a link to nowhere is not the alternative.
     */
    renderPage({ teams: [{ ...ILVES, href: null }] });

    expect(screen.getByText("Ilves")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ilves" })).not.toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
    expect(removeButtons()).toHaveLength(2);
  });
});

describe("removing", () => {
  it("takes the competition off the list without a reload", async () => {
    renderPage({ teams: [] });

    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Veikkausliiga" })).not.toBeInTheDocument()
    );
    expect(removeCompetition).toHaveBeenCalledWith("kotimaa", "VL");
    expect(screen.getByText("Ei suosikkisarjoja. Lisää niitä sarjan sivulta.")).toBeInTheDocument();
  });

  it("takes the team off the list", async () => {
    renderPage({ competitions: [] });

    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Ilves" })).not.toBeInTheDocument()
    );
    expect(removeTeam).toHaveBeenCalledWith("taso", 60731);
  });

  it("removes only the row that was pressed", async () => {
    // The two lists are hidden by key; a shared flag would empty the page.
    renderPage({ teams: [ILVES, { ...ILVES, teamProviderId: 60999, name: "KuPS" }] });

    fireEvent.click(removeRow("KuPS"));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "KuPS" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Ilves" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Veikkausliiga" })).toBeInTheDocument();
  });

  it("does not hide a row whose removal failed, and says so", async () => {
    removeTeam.mockResolvedValue({ ok: false });
    renderPage({ competitions: [] });

    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));

    await waitFor(() =>
      expect(screen.getByText("Poistaminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Ilves" })).toBeInTheDocument();
  });

  it("treats a rejected invocation the same as a refusal", async () => {
    removeCompetition.mockRejectedValue(new Error("network"));
    renderPage({ teams: [] });

    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));

    await waitFor(() =>
      expect(screen.getByText("Poistaminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Veikkausliiga" })).toBeInTheDocument();
  });

  it("clears an old failure when the next attempt works", async () => {
    removeTeam.mockResolvedValue({ ok: false });
    renderPage({ competitions: [] });
    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));
    await waitFor(() => expect(screen.getByText(/epäonnistui/)).toBeInTheDocument());
    // The notice renders from inside the transition, so it appears while the
    // button is still disabled; clicking before then would do nothing at all.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Poista suosikeista" })).not.toBeDisabled()
    );

    removeTeam.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Poista suosikeista" }));

    await waitFor(() => expect(screen.queryByText(/epäonnistui/)).not.toBeInTheDocument());
  });

  it("tells the two providers' ids apart when hiding a row", async () => {
    // Same id, two clubs: hiding by id alone would take both off the page.
    renderPage({
      competitions: [],
      teams: [
        { source: "taso", teamProviderId: 317, name: "Ilves", href: "/kotimaa/joukkue/317" },
        {
          source: "football-data",
          teamProviderId: 317,
          name: "Rangers",
          href: "/ulkomaat/joukkue/317",
        },
      ],
    });

    fireEvent.click(removeRow("Ilves"));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Ilves" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Rangers" })).toBeInTheDocument();
  });
});
