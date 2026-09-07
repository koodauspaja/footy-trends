import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPrompt } from "@/components/sign-in-prompt";

const { socialSignIn, pathname, replace } = vi.hoisted(() => ({
  socialSignIn: vi.fn(() => Promise.resolve()),
  pathname: { current: "/asetukset" },
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ signIn: { social: socialSignIn } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  socialSignIn.mockClear();
  socialSignIn.mockResolvedValue(undefined);
  replace.mockClear();
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
