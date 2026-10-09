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

beforeAll(() => {
  fetchSession.mockImplementation(async () => Response.json(SESSION));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("a session the browser already holds when a tree hydrates", () => {
  it("hydrates from the signed-out HTML with no mismatch, then shows the signed-in tree", async () => {
    // What the server sends: no session exists there.
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Page />);
    document.body.append(container);
    const page = within(container);
    expect(page.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/");
    expect(page.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(page.queryByRole("button", { name: /suosik/i })).not.toBeInTheDocument();

    const recoverable: unknown[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const subscriber = render(<Subscriber />);
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      // The browser gets its session before the tree hydrates, as it does when
      // a part of a page streams in after the header.
      await waitFor(() => expect(screen.getByText("signed in")).toBeInTheDocument());

      await act(async () => {
        root = hydrateRoot(container, <Page />, {
          onRecoverableError: (error) => recoverable.push(error),
        });
      });

      expect(recoverable).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      // An attribute React found different while hydrating is left as the server
      // sent it, so the link's target is read from the DOM.
      expect(page.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/?valitse=1");
      expect(page.getByRole("searchbox", { name: "Hae joukkuetta" })).toBeInTheDocument();
      expect(
        page.getByRole("button", { name: "Poista suosikeista: Veikkausliiga" })
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      consoleError.mockRestore();
      // The real client cleans up some time after its last subscriber leaves, and
      // needs a `window` to do it. Both leave here, on a clock this test can run
      // forward, so the cleanup happens while this file's jsdom still exists.
      vi.useFakeTimers();
      act(() => root?.unmount());
      subscriber.unmount();
      container.remove();
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
