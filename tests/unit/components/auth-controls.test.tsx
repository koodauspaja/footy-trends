import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthControls, AuthNotice } from "@/components/auth-controls";

const { sessionState, socialSignIn, signOut, searchParams, pathname } = vi.hoisted(() => ({
  sessionState: { current: { data: null as unknown, isPending: false } },
  socialSignIn: vi.fn(),
  signOut: vi.fn(),
  searchParams: { current: new URLSearchParams() },
  pathname: { current: "/" },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionState.current,
  signIn: { social: socialSignIn },
  signOut,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => searchParams.current,
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
  signOut.mockClear();
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
