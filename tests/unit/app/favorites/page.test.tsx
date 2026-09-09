import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/suosikit` route itself, from specs/026-favourites.md. Without this file
 * it has no test, which vitest scores as 100% — it only measures files a test
 * imports — while Sonar correctly reports 0%.
 *
 * The route's own job is the resolving: keys in, names and links out. The
 * registry is real here rather than mocked, because "is this competition still
 * one we have" is the question the page exists to answer.
 */
const { getSession, getFavouriteKeys, resolveTeamNames, logger, state } = vi.hoisted(() => {
  const state = {
    signedIn: true,
    sessionThrows: false,
    favouritesThrow: false,
    keys: { teams: [] as string[], competitions: [] as string[] },
    names: [] as unknown[],
  };
  return {
    state,
    getSession: vi.fn(async () => {
      if (state.sessionThrows) throw new Error("database down");
      return state.signedIn ? { user: { id: "user-1" } } : null;
    }),
    getFavouriteKeys: vi.fn(async () => {
      if (state.favouritesThrow) throw new Error("database down");
      return state.keys;
    }),
    resolveTeamNames: vi.fn(async () => state.names),
    logger: { error: vi.fn() },
  };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/favourites", () => ({ getFavouriteKeys, resolveTeamNames }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/favourite-actions", () => ({
  removeFavouriteTeamAction: vi.fn(),
  removeFavouriteCompetitionAction: vi.fn(),
}));
// Both halves of the page reach the client: `SignInPrompt` uses `signIn`, and
// the list refetches the session after a removal so every star in the app
// catches up.
vi.mock("@/lib/auth-client", () => ({
  signIn: { social: vi.fn() },
  useSession: () => ({ data: null, refetch: vi.fn() }),
}));
// The sign-in prompt is a client component that reads the router; without this
// the signed-out branch throws "app router not mounted" rather than rendering.
vi.mock("next/navigation", () => ({
  usePathname: () => "/suosikit",
  useRouter: () => ({ replace: vi.fn() }),
}));

async function renderPage() {
  const { default: Favourites } = await import("@/app/favorites/page");
  render(await Favourites());
}

beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
  state.sessionThrows = false;
  state.favouritesThrow = false;
  state.keys = { teams: [], competitions: [] };
  state.names = [];
});

describe("the favourites route", () => {
  it("is never prerendered, because everything on it is per-reader", async () => {
    const route = await import("@/app/favorites/page");

    expect(route.dynamic).toBe("force-dynamic");
  });

  it("asks a signed-out reader to sign in, rather than redirecting", async () => {
    state.signedIn = false;

    await renderPage();

    expect(screen.getByText("Kirjaudu sisään nähdäksesi suosikkisi.")).toBeInTheDocument();
    expect(getFavouriteKeys).not.toHaveBeenCalled();
  });

  it("does not claim a reader is signed out when the session read failed", async () => {
    // "Sign in" would be a claim we cannot make from a database error, and the
    // reader would try and be told they already are.
    state.sessionThrows = true;

    await renderPage();

    expect(
      screen.getByText("Suosikkien lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("reports a failed read instead of an error page", async () => {
    state.favouritesThrow = true;

    await renderPage();

    expect(
      screen.getByText("Suosikkien lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("names a known competition and links to its table", async () => {
    state.keys = { teams: [], competitions: ["kotimaa:M1L"] };

    await renderPage();

    expect(screen.getByRole("link", { name: "Ykkösliiga" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=M1L"
    );
  });

  it("says so when a competition is no longer one we have", async () => {
    // Someone favourited it, then it left the registry. The row still exists
    // and still has to be removable.
    state.keys = { teams: [], competitions: ["kotimaa:GONE"] };

    await renderPage();

    expect(screen.getByText("Sarjaa ei enää ole.")).toBeInTheDocument();
  });

  it("drops a key that is not one, rather than rendering it", async () => {
    state.keys = { teams: ["nonsense"], competitions: ["eurooppa:LL"] };

    await renderPage();

    expect(resolveTeamNames).toHaveBeenCalledWith([]);
    expect(screen.getByText("Ei suosikkisarjoja. Lisää niitä sarjan sivulta.")).toBeInTheDocument();
  });

  it("sends each team to its own provider's page", async () => {
    state.keys = { teams: ["taso:60731", "football-data:86"], competitions: [] };
    state.names = [
      { source: "taso", teamProviderId: 60731, name: "Ilves", region: "kotimaa" },
      { source: "football-data", teamProviderId: 86, name: "Real Madrid", region: "ulkomaat" },
    ];

    await renderPage();

    expect(screen.getByRole("link", { name: "Ilves" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60731"
    );
    expect(screen.getByRole("link", { name: "Real Madrid" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/86"
    );
    expect(getFavouriteKeys).toHaveBeenCalledWith("user-1");
  });

  it("sends a national side to its own region, not to the club pages", async () => {
    // `football-data` covers clubs and national sides, and the same standings
    // page renders both — so the region comes from the team's competitions,
    // never from its provider.
    state.keys = { teams: ["football-data:8722"], competitions: [] };
    state.names = [
      { source: "football-data", teamProviderId: 8722, name: "Suomi", region: "maajoukkueet" },
    ];

    await renderPage();

    expect(screen.getByRole("link", { name: "Suomi" })).toHaveAttribute(
      "href",
      "/maajoukkueet/joukkue/8722"
    );
  });

  it("does not link a team whose region could not be worked out", async () => {
    // A name but no region: better an unlinked row than a link to a different
    // club's page.
    state.keys = { teams: ["football-data:86"], competitions: [] };
    state.names = [
      { source: "football-data", teamProviderId: 86, name: "Real Madrid", region: null },
    ];

    await renderPage();

    expect(screen.getByText("Real Madrid")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Real Madrid" })).not.toBeInTheDocument();
  });

  it("does not link a team it could not name", async () => {
    state.keys = { teams: ["taso:60731"], competitions: [] };
    state.names = [{ source: "taso", teamProviderId: 60731, name: null, region: null }];

    await renderPage();

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /joukkue/ })).not.toBeInTheDocument();
  });

  it("lists competitions in registry order, not the order they were favourited", async () => {
    /**
     * specs/026 promises the registry's own order. Query order is whatever the
     * planner returns, so without sorting the page rearranges itself as the
     * reader adds favourites.
     */
    state.keys = { teams: [], competitions: ["kotimaa:M1L", "kotimaa:VL"] };

    await renderPage();

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Veikkausliiga", "Ykkösliiga"]);
  });

  it("groups the regions in the order the app shows them", async () => {
    state.keys = { teams: [], competitions: ["ulkomaat:PL", "kotimaa:VL"] };

    await renderPage();

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links?.[0]).toBe("Veikkausliiga");
  });

  it("puts a retired competition last in its region rather than first", async () => {
    // It has no place in the registry order, and it still has a row to remove.
    state.keys = { teams: [], competitions: ["kotimaa:GONE", "kotimaa:VL"] };

    await renderPage();

    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows?.[0]).toContain("Veikkausliiga");
    expect(rows?.[1]).toContain("Sarjaa ei enää ole.");
  });

  it("lists teams alphabetically, by the Finnish collation", async () => {
    /**
     * The fixture is chosen so it can only pass one way. The Finnish alphabet
     * ends Z, Å, Ä, Ö; UTF-16 puts Ä (U+00C4) before Å (U+00C5). So a plain
     * `<` comparison answers `Ähtäri, ÅIFK` and only `localeCompare(…, "fi")`
     * answers `ÅIFK, Ähtäri`.
     *
     * A `Zurich`/`Äänekoski` fixture would have proved nothing: both orderings
     * agree there, which is how the first version of this test passed with the
     * collation removed.
     */
    state.keys = { teams: ["taso:1", "taso:2", "taso:3"], competitions: [] };
    state.names = [
      { source: "taso", teamProviderId: 1, name: "Ähtäri", region: "kotimaa" },
      { source: "taso", teamProviderId: 2, name: "ÅIFK", region: "kotimaa" },
      { source: "taso", teamProviderId: 3, name: "Ilves", region: "kotimaa" },
    ];

    await renderPage();

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Ilves", "ÅIFK", "Ähtäri"]);
  });

  it("puts a team it could not name last, rather than sorting it as an empty string", async () => {
    state.keys = { teams: ["taso:1", "taso:2"], competitions: [] };
    state.names = [
      { source: "taso", teamProviderId: 1, name: null, region: null },
      { source: "taso", teamProviderId: 2, name: "Ilves", region: "kotimaa" },
    ];

    await renderPage();

    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows?.[0]).toContain("Ilves");
    expect(rows?.[1]).toContain("Joukkuetta ei löytynyt.");
  });

  it("has a title of its own", async () => {
    const route = await import("@/app/favorites/page");

    expect(route.metadata.title).toBe("Suosikit");
  });
});
