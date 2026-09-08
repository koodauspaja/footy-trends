import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthControls, AuthNotice } from "@/components/auth-controls";

const { sessionState, socialSignIn, signOut, searchParams, pathname, replace } = vi.hoisted(() => ({
  sessionState: { current: { data: null as unknown, isPending: false } },
  socialSignIn: vi.fn(() => Promise.resolve()),
  signOut: vi.fn(() => Promise.resolve()),
  searchParams: { current: new URLSearchParams() },
  pathname: { current: "/" },
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionState.current,
  signIn: { social: socialSignIn },
  signOut,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ replace }),
}));

function signedOut() {
  sessionState.current = { data: null, isPending: false };
}

function signedInAs(
  name: string,
  extras: { image?: string | null; avatarVersion?: number | null } = {}
) {
  sessionState.current = {
    data: {
      user: { name, image: extras.image ?? null },
      avatarVersion: extras.avatarVersion ?? null,
    },
    isPending: false,
  };
}

/**
 * `Kirjaudu ulos` moved inside the account menu in specs/024-account-settings.md,
 * so reaching it now takes a click on the trigger first.
 */
function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: /^Tili:/ }));
}

function pending() {
  sessionState.current = { data: null, isPending: true };
}

beforeEach(() => {
  socialSignIn.mockClear();
  socialSignIn.mockResolvedValue(undefined);
  signOut.mockClear();
  signOut.mockResolvedValue(undefined);
  replace.mockReset();
  searchParams.current = new URLSearchParams();
  pathname.current = "/";
  signedOut();
});

describe("AuthControls", () => {
  it("offers sign-in in Finnish when signed out", () => {
    render(<AuthControls />);

    expect(screen.getByRole("button", { name: "Kirjaudu sisään" })).toBeInTheDocument();
  });

  it("shows the reader's name and sign-out when signed in", () => {
    signedInAs("Matti Meikäläinen");

    render(<AuthControls />);

    expect(screen.getByText("Matti Meikäläinen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kirjaudu sisään" })).not.toBeInTheDocument();
    // Behind the menu now, not beside the name.
    expect(screen.queryByRole("button", { name: "Kirjaudu ulos" })).not.toBeInTheDocument();

    openAccountMenu();

    expect(screen.getByRole("button", { name: "Kirjaudu ulos" })).toBeInTheDocument();
  });

  it("shows neither state while the session is still loading", () => {
    // The point of the empty slot: a signed-in reader must never be shown
    // `Kirjaudu sisään` on the way to being recognised.
    pending();

    render(<AuthControls />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Kirjaudu sisään")).not.toBeInTheDocument();
  });

  it("sends the reader back to the page they signed in from", () => {
    pathname.current = "/kotimaa/sarjataulukko";
    searchParams.current = new URLSearchParams({ kilpailu: "VL", kausi: "2026" });

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026",
      errorCallbackURL: "/?error=auth",
    });
  });

  it("returns to a bare path when the page carries no query", () => {
    pathname.current = "/ulkomaat";

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/ulkomaat" })
    );
  });

  it("signs the reader out on request", () => {
    signedInAs("Matti");

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("AuthNotice", () => {
  it("says nothing when sign-in did not fail", () => {
    render(<AuthNotice />);

    expect(screen.queryByText(/Kirjautuminen epäonnistui/)).not.toBeInTheDocument();
  });

  it("reports a failed sign-in in Finnish", () => {
    searchParams.current = new URLSearchParams({ error: "auth" });

    render(<AuthNotice />);

    expect(screen.getByText("Kirjautuminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
  });

  it("says the same thing whatever Google blamed, leaking nothing", () => {
    // A cancelled consent screen and an account that is not on the test-user
    // list must be indistinguishable to the reader.
    for (const error of ["access_denied", "server_error", "auth"]) {
      searchParams.current = new URLSearchParams({ error });
      const { unmount } = render(<AuthNotice />);

      expect(screen.getByText("Kirjautuminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("a failed request is reported, not dropped", () => {
  it("reports a sign-out that failed, rather than leaving a stale header", async () => {
    // Without this the reader sees a header claiming they are signed in while
    // the session row and cookie still exist, and the rejection goes unhandled.
    signedInAs("Matti");
    signOut.mockRejectedValue(new Error("network"));
    pathname.current = "/kotimaa/ottelut";

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    // Same page, not the front page: the reader keeps their place.
    expect(replace).toHaveBeenCalledWith("/kotimaa/ottelut?error=signout");
  });

  it("reports a sign-in that never reached Google", async () => {
    socialSignIn.mockRejectedValue(new Error("network"));
    pathname.current = "/ulkomaat";

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    expect(replace).toHaveBeenCalledWith("/ulkomaat?error=auth");
  });

  it("keeps the query the reader already had", async () => {
    signedInAs("Matti");
    signOut.mockRejectedValue(new Error("network"));
    pathname.current = "/kotimaa/sarjataulukko";
    searchParams.current = new URLSearchParams({ kilpailu: "VL" });

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    expect(replace).toHaveBeenCalledWith("/kotimaa/sarjataulukko?kilpailu=VL&error=signout");
  });

  it("names sign-out as what failed, not sign-in", () => {
    searchParams.current = new URLSearchParams({ error: "signout" });

    render(<AuthNotice />);

    expect(screen.getByText("Uloskirjautuminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
  });
});

describe("an error code taken straight off the query string", () => {
  // `MESSAGES` is a Map for this reason: as an object literal, each of these
  // keys resolves to an inherited member — `Object.prototype`, or a function —
  // which `??` does not treat as absent, so it would reach `Notice` as a
  // non-string child and throw during render.
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])(
    "falls back to the sign-in message for %s instead of throwing",
    (code) => {
      searchParams.current = new URLSearchParams({ error: code });

      expect(() => render(<AuthNotice />)).not.toThrow();
      expect(screen.getByText("Kirjautuminen epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
    }
  );
});

/**
 * #266: after a cancelled sign-in the reader sits on `?error=auth`, and
 * `returnPath` carried that straight into Google's `callbackURL` — so a
 * *successful* sign-in returned them to their own error message.
 */
describe("a spent error does not survive the next attempt", () => {
  it("does not ask Google to return the reader to the error they just cleared", () => {
    pathname.current = "/";
    searchParams.current = new URLSearchParams({ error: "auth" });

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/" }));
  });

  it("keeps the page's own state while dropping the error", () => {
    // `kilpailu`/`kausi` are the page's state and must survive; `error`
    // belongs to the attempt that failed, not to the page.
    pathname.current = "/kotimaa/sarjataulukko";
    searchParams.current = new URLSearchParams({
      kilpailu: "VL",
      error: "auth",
      kausi: "2026",
    });

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026" })
    );
  });

  it("clears a stale notice after a sign-out that works", async () => {
    // The rarer sibling: a failed sign-out leaves `?error=signout`, and a
    // successful one does not navigate, so the notice would sit there.
    signedInAs("Matti");
    pathname.current = "/kotimaa/ottelut";
    searchParams.current = new URLSearchParams({ error: "signout" });

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    expect(replace).toHaveBeenCalledWith("/kotimaa/ottelut");
  });

  it("leaves the URL alone when a sign-out works and there was no error", async () => {
    // No history churn on the ordinary path.
    signedInAs("Matti");
    pathname.current = "/kotimaa/ottelut";

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());

    expect(replace).not.toHaveBeenCalled();
  });
});

describe("a URL rewrite that itself fails", () => {
  it("is swallowed, and not mislabelled as a failed sign-out", async () => {
    // `clearError` only rewrites the URL. If that throws, the stale notice
    // stays put — but the throw must not escape as an unhandled rejection, and
    // must not be reported as though signing out had failed.
    signedInAs("Matti");
    pathname.current = "/kotimaa/ottelut";
    searchParams.current = new URLSearchParams({ error: "signout" });
    replace.mockImplementation(() => {
      throw new Error("navigation failed");
    });

    render(<AuthControls />);
    openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    // Once, by `clearError`. A second call would mean `report` had run and
    // told the reader their sign-out failed, which it did not.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("Which picture the account menu shows", () => {
  const GOOGLE = "https://lh3.googleusercontent.com/a/matti";

  /**
   * The chain specs/025-custom-avatar.md extends by one: the reader's own
   * picture, then Google's, then their name. The version rides on the session
   * the browser already fetches, so preferring the custom one costs no extra
   * request.
   */
  it("prefers the reader's own picture over Google's", () => {
    signedInAs("Matti", { image: GOOGLE, avatarVersion: 1757325600000 });

    const { container } = render(<AuthControls />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/api/avatar/me?v=1757325600000");
  });

  it("falls back to Google's picture when there is no custom one", () => {
    signedInAs("Matti", { image: GOOGLE, avatarVersion: null });

    const { container } = render(<AuthControls />);

    expect(container.querySelector("img")).toHaveAttribute("src", GOOGLE);
  });

  it("falls back to the name when there is neither", () => {
    // 024's behaviour, unchanged: an avatar that cannot load must never leave
    // an unlabelled button behind.
    signedInAs("Matti", { image: null, avatarVersion: null });

    const { container } = render(<AuthControls />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: /^Tili:/ })).toHaveTextContent("Matti");
  });
});
