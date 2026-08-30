import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

function renderAt(path: string) {
  pathname.current = path;
  render(<SiteHeader />);
}

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
});
