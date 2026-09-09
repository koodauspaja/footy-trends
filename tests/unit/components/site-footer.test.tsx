import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

/**
 * The footer, from #302. It exists so the privacy policy is *reachable*: Google
 * requires that before the OAuth consent screen can leave Testing, and a page
 * nothing links to is reachable only by someone who knows the URL.
 */
describe("SiteFooter", () => {
  it("links to the privacy policy, on its Finnish URL", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Tietosuoja" })).toHaveAttribute("href", "/tietosuoja");
  });

  it("is a labelled landmark, so it is not just loose links at the bottom", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sivuston tiedot" })).toBeInTheDocument();
  });
});
