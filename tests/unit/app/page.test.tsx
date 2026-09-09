import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home, { metadata } from "@/app/page";

// The picker now hosts `StartRedirect`, which reads the session and the router
// to honour a stored start page. Mocked so these assertions stay about the
// picker. See specs/024-account-settings.md.
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

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse alue");
  });
});
