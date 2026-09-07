import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPrompt } from "@/components/sign-in-prompt";

const { socialSignIn, pathname } = vi.hoisted(() => ({
  socialSignIn: vi.fn(() => Promise.resolve()),
  pathname: { current: "/asetukset" },
}));

vi.mock("@/lib/auth-client", () => ({ signIn: { social: socialSignIn } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

beforeEach(() => {
  socialSignIn.mockClear();
  socialSignIn.mockResolvedValue(undefined);
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

  it("does not drop the promise when sign-in cannot start", async () => {
    socialSignIn.mockRejectedValue(new Error("network"));
    render(<SignInPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu sisään" }));

    // The header's notice reports the failure; the point here is that the
    // rejection is handled rather than left unhandled.
    await vi.waitFor(() => expect(socialSignIn).toHaveBeenCalled());
  });
});
