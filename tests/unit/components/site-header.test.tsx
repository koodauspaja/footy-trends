import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";

const { pathname, session } = vi.hoisted(() => ({
  pathname: { current: "/" },
  session: { current: { data: null as unknown, isPending: false } },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

// The header now renders the auth control, which reads a session. Mocked here
// so these breadcrumb assertions keep testing the breadcrumb.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => session.current,
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
}));

function renderAt(path: string) {
  pathname.current = path;
  render(<SiteHeader />);
}

/**
 * Both of these are module-level state that individual tests write to, so
 * without a reset a test inherits whatever the one before it left behind — and
 * then passes or fails depending on the order they are declared in. Signed out,
 * on the front page, is the state each test starts from unless it says otherwise.
 */
beforeEach(() => {
  pathname.current = "/";
  session.current = { data: null, isPending: false };
});

describe("SiteHeader", () => {
  it("shows a link back to the front page", () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/");
  });

  it("adds the region crumb below a region", () => {
    renderAt("/kotimaa/sarjataulukko");

    expect(screen.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Kotimaa" })).toHaveAttribute("href", "/kotimaa");
  });

  it.each([
    ["/ulkomaat/ottelut", "Ulkomaat", "/ulkomaat"],
    ["/maajoukkueet/huuhkajat", "Maajoukkueet", "/maajoukkueet"],
  ])("names the region on %s", (path, label, href) => {
    renderAt(path);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("shows only Etusivu on the front page", () => {
    renderAt("/");

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows only Etusivu on a region picker, which the crumb would self-link", () => {
    renderAt("/ulkomaat");

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("labels the trail for screen readers in Finnish", () => {
    renderAt("/kotimaa/ottelut");

    expect(screen.getByRole("navigation", { name: "Murupolku" })).toBeInTheDocument();
  });

  it("carries the sign-in control alongside the trail", () => {
    renderAt("/kotimaa/ottelut");

    expect(screen.getByRole("button", { name: "Kirjaudu sisään" })).toBeInTheDocument();
  });

  it("keeps the auth control outside the breadcrumb landmark", () => {
    // Otherwise "Murupolku" names a trail that also contains a login button.
    renderAt("/kotimaa/ottelut");

    const trail = screen.getByRole("navigation", { name: "Murupolku" });

    expect(within(trail).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the signed-in reader's name in the header", () => {
    session.current = {
      data: { user: { name: "Matti Meikäläinen", image: null } },
      isPending: false,
    };
    renderAt("/");

    expect(screen.getByText("Matti Meikäläinen")).toBeInTheDocument();

    // `Kirjaudu ulos` lives in the account menu as of specs/024.
    fireEvent.click(screen.getByRole("button", { name: "Tili: Matti Meikäläinen" }));

    expect(screen.getByRole("button", { name: "Kirjaudu ulos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asetukset" })).toHaveAttribute("href", "/asetukset");
  });

  it("points Etusivu at the picker for a reader with a start page", () => {
    // Without the parameter this crumb would redirect straight back to the
    // region they are already in, and the picker would be unreachable by
    // clicking. See specs/024-account-settings.md.
    session.current = {
      data: { user: { name: "Matti", image: null }, defaultRegion: "kotimaa" },
      isPending: false,
    };
    renderAt("/kotimaa/ottelut");

    expect(screen.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/?valitse=1");
  });

  it("leaves Etusivu alone when there is no start page to escape", () => {
    session.current = { data: { user: { name: "Matti", image: null } }, isPending: false };
    renderAt("/kotimaa/ottelut");

    expect(screen.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/");
  });

  describe("where the search sits (#373)", () => {
    const signedIn = () => {
      session.current = {
        data: { user: { name: "Matti Meikäläinen", image: null } },
        isPending: false,
      };
    };

    it("puts the search below the top row, not inside it", async () => {
      signedIn();
      renderAt("/");

      const field = await screen.findByRole("searchbox", { name: "Hae joukkuetta" });
      const trail = screen.getByRole("navigation", { name: "Murupolku" });
      const topRow = trail.parentElement as HTMLElement;

      // The arrangement, asserted structurally: the search is not a descendant
      // of the row holding the breadcrumb and the account control. Asserting
      // class names instead would pass with the search anywhere at all.
      expect(topRow.contains(field)).toBe(false);
    });

    it("leaves the account control in the top row, after the breadcrumb", async () => {
      signedIn();
      renderAt("/");

      const trail = screen.getByRole("navigation", { name: "Murupolku" });
      const topRow = trail.parentElement as HTMLElement;
      const account = screen.getByRole("button", { name: "Tili: Matti Meikäläinen" });

      expect(topRow.contains(account)).toBe(true);
      // `justify-between` puts the last child at the far end, so the account
      // control being *after* the trail is what places it in the corner.
      expect(
        trail.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("renders the search after the top row in document order", async () => {
      signedIn();
      renderAt("/");

      const field = await screen.findByRole("searchbox", { name: "Hae joukkuetta" });
      const trail = screen.getByRole("navigation", { name: "Murupolku" });

      expect(trail.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("leaves no empty strip for a signed-out reader", () => {
      // `TeamSearch` returns null for them, and it owns its row's padding — so
      // there is no wrapper left behind. A header that grew a blank 12px band
      // for someone who cannot use the search would be a visible regression for
      // the reader least able to explain it.
      renderAt("/");

      expect(screen.queryByRole("searchbox", { name: "Hae joukkuetta" })).toBeNull();
      const header = document.querySelector("header") as HTMLElement;
      expect(header.querySelectorAll("div.pb-3")).toHaveLength(0);
    });
  });
});
