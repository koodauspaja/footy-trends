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

function signedInAs(name: string) {
  sessionState.current = { data: { user: { name } }, isPending: false };
}

function pending() {
  sessionState.current = { data: null, isPending: true };
}

beforeEach(() => {
  socialSignIn.mockClear();
  socialSignIn.mockResolvedValue(undefined);
  signOut.mockClear();
  signOut.mockResolvedValue(undefined);
  replace.mockClear();
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
    expect(screen.getByRole("button", { name: "Kirjaudu ulos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kirjaudu sisään" })).not.toBeInTheDocument();
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
