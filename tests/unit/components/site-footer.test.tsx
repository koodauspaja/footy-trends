import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

/**
 * The footer. It exists so the privacy policy is reachable: Google requires
 * that before the OAuth consent screen can leave Testing, and a page nothing
 * links to is reachable only by someone who knows the URL.
 *
 * decisions/302-privacy-policy-and-footer.md
 * decisions/303-terms-and-attribution.md
 */

describe("SiteFooter", () => {
  it("links to the privacy policy, on its Finnish URL", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Tietosuoja" })).toHaveAttribute("href", "/tietosuoja");
  });

  it("links to the terms of service", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Käyttöehdot" })).toHaveAttribute(
      "href",
      "/kayttoehdot"
    );
  });

  it("carries football-data.org's attribution on every page", () => {
    // Their free tier requires the credit in "a visible section of your application or website",
    // and the footer is on every page. In Finnish, as every string a reader sees is: what the
    // requirement needs is their name, visible, with a link, and that survives the translation.
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    // A joint credit, deliberately drawing no line between the two: both
    // providers appear on `/maajoukkueet`, and a one-line footer that says
    // which is which gets it wrong. The split lives on the terms page.
    expect(footer.textContent).toContain("Tiedot tarjoaa football-data.org ja Suomen Palloliitto.");
    expect(screen.getByRole("link", { name: "football-data.org" })).toHaveAttribute(
      "href",
      "https://www.football-data.org/"
    );
  });

  it("is a labelled landmark, so it is not just loose links at the bottom", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sivuston tiedot" })).toBeInTheDocument();
  });
});
