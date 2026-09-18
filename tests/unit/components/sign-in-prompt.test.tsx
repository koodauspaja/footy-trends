import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPrompt } from "@/components/sign-in-prompt";

const { socialSignIn, pathname, search, replace } = vi.hoisted(() => ({
  socialSignIn: vi.fn(() => Promise.resolve()),
  pathname: { current: "/asetukset" },
  search: { current: "" },
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ signIn: { social: socialSignIn } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(search.current),
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  socialSignIn.mockClear();
  socialSignIn.mockResolvedValue(undefined);
  replace.mockClear();
  pathname.current = "/asetukset";
  search.current = "";
});

describe("SignInPrompt", () => {
  it("explains itself in Finnish rather than redirecting", () => {
    render(<SignInPrompt />);

    expect(screen.getByText("Kirjaudu sisään nähdäksesi asetuksesi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirjaudu sisään" })).toBeInTheDocument();
  });

  it("returns the reader to the settings page they were trying to reach", () => {
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", callbackURL: "/asetukset" })
    );
  });

  it("returns the reader to the same competition and season of a team page", () => {
    // The chart's prompt (specs/030). Without the query the reader came back to
    // the bare team URL, which resolves a competition of its own.
    pathname.current = "/kotimaa/joukkue/123";
    search.current = "kilpailu=VL&kausi=2024";
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/kotimaa/joukkue/123?kilpailu=VL&kausi=2024" })
    );
  });

  it("does not send a previous attempt's error back as the destination", () => {
    pathname.current = "/kotimaa/joukkue/123";
    search.current = "kilpailu=VL&error=auth";
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/kotimaa/joukkue/123?kilpailu=VL" })
    );
  });

  it("keeps the page's state when reporting that sign-in cannot start", async () => {
    pathname.current = "/kotimaa/joukkue/123";
    search.current = "kilpailu=VL&kausi=2024";
    socialSignIn.mockRejectedValue(new Error("network"));
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/kotimaa/joukkue/123?kilpailu=VL&kausi=2024&error=auth")
    );
  });

  it("tells the reader when sign-in cannot even start", async () => {
    // Swallowing this leaves a button that appears to do nothing. It goes
    // through the same `?error=` channel Google's own failures use, so the
    // header's notice renders it.
    socialSignIn.mockRejectedValue(new Error("network"));
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/asetukset?error=auth"));
  });

  it("leaves the URL alone when sign-in starts normally", async () => {
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    await vi.waitFor(() => expect(socialSignIn).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
