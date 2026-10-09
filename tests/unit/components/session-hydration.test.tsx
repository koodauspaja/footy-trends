import { act, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FavouriteToggle } from "@/components/favourite-toggle";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/lib/auth-client";

/**
 * The header, the team search and the star read the sign-in state on their
 * first render, and hydrate cleanly even when the browser already holds a
 * session. `@/lib/auth-client` is the real one here, because the hydration
 * snapshot under test is better-auth's.
 *
 * decisions/535-session-read-needs-no-hydration-wait.md
 */

// Stubbed before the imports above run: the client keeps the `fetch` it finds
// when it is created.
const { fetchSession } = vi.hoisted(() => {
  const fetchSession = vi.fn();
  vi.stubGlobal("fetch", fetchSession);
  return { fetchSession };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/kotimaa/sarjataulukko",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

// Server actions, which reach the database when imported.
vi.mock("@/lib/favourite-actions", () => ({
  toggleFavouriteTeamAction: vi.fn(),
  toggleFavouriteCompetitionAction: vi.fn(),
}));
vi.mock("@/lib/team-search-actions", () => ({ searchTeamsAction: vi.fn() }));

const SESSION = {
  session: {
    id: "session-1",
    token: "token-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  },
  user: { id: "user-1", name: "Matti Meikäläinen", email: "matti@example.com", image: null },
  defaultRegion: "kotimaa",
  favoriteTeams: [],
  favoriteCompetitions: ["kotimaa:VL"],
};

// How long nanostores waits after the last unsubscribe before it runs a
// store's cleanup: `STORE_UNMOUNT_DELAY`, which this project cannot import
// without depending on a package it does not declare.
const STORE_UNMOUNT_DELAY_MS = 1000;

function Page() {
  return (
    <>
      <SiteHeader />
      <FavouriteToggle code="VL" kind="competition" name="Veikkausliiga" region="kotimaa" />
    </>
  );
}

// Subscribes like any component, which is what makes the client fetch a session.
function Subscriber() {
  const { data } = useSession();
  return <output>{data ? "signed in" : "signed out"}</output>;
}

let unmountSubscriber = () => {};

beforeAll(() => {
  fetchSession.mockImplementation(async () => Response.json(SESSION));
});

afterAll(() => {
  // The real client's cleanup needs a `window`, so it runs here, while this
  // file's jsdom still exists, and not a second after the file has finished.
  vi.useFakeTimers();
  unmountSubscriber();
  document.body.replaceChildren();
  vi.advanceTimersByTime(STORE_UNMOUNT_DELAY_MS + 1);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a session the browser already holds when a tree hydrates", () => {
  it("hydrates from the signed-out HTML with no mismatch, then shows the signed-in tree", async () => {
    // What the server sends: no session exists there.
    const serverHtml = renderToString(<Page />);
    expect(serverHtml).toContain('href="/"');
    expect(serverHtml).not.toContain("Hae joukkuetta");
    expect(serverHtml).not.toContain("suosikeista");

    // The browser gets its session before the tree below hydrates, as it does
    // when a part of a page streams in after the header.
    ({ unmount: unmountSubscriber } = render(<Subscriber />));
    await waitFor(() => expect(screen.getByText("signed in")).toBeInTheDocument());

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);
    const recoverable: unknown[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Page />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    const page = within(container);
    expect(recoverable).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    // An attribute React found different while hydrating is left as the server
    // sent it, so the link's target is read from the DOM.
    expect(page.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/?valitse=1");
    expect(page.getByRole("searchbox", { name: "Hae joukkuetta" })).toBeInTheDocument();
    expect(page.getByRole("button", { name: "Poista suosikeista: Veikkausliiga" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    consoleError.mockRestore();
    act(() => root?.unmount());
  });
});
