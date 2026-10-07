import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home, { metadata } from "@/app/page";

/**
 * The front page: the region picker.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/006-other-competitions.md
 * decisions/009-veikkausliiga.md
 * decisions/024-account-settings.md
 * decisions/054-prediction-quality.md
 */

// The picker hosts `StartRedirect`, which reads the session and the router to
// honour a stored start page. Mocked so these assertions stay about the picker.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null, isPending: false }),
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

describe("Home page (region picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Valitse alue" })).toBeInTheDocument();
  });

  it("links to the domestic and international sections", () => {
    render(<Home />);

    const kotimaa = screen.getByRole("link", { name: /Kotimaa/ });
    expect(kotimaa).toHaveAttribute("href", "/kotimaa");

    const ulkomaat = screen.getByRole("link", { name: /Ulkomaat/ });
    expect(ulkomaat).toHaveAttribute("href", "/ulkomaat");
  });

  it("offers the models' track record as a fourth tile (specs/054 S1, S13)", () => {
    render(<Home />);

    const tile = screen.getByRole("link", { name: /Ennusteet/ });
    expect(tile).toHaveAttribute("href", "/ennusteet");
    expect(tile).toHaveTextContent("Ennusteiden osuvuus");
    expect(screen.getAllByRole("link").at(-1)).toBe(tile);
  });

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse alue");
  });
});
