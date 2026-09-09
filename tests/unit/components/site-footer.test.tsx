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

  it("links to the terms of service", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Käyttöehdot" })).toHaveAttribute(
      "href",
      "/kayttoehdot"
    );
  });

  it("carries football-data.org's attribution on every page", () => {
    /**
     * Their free tier requires it in "a visible section of your application or
     * website" (#303). The footer is on every page, which is the strongest
     * reading of that; the terms page alone would be the weakest.
     *
     * Their wording, in English, because it is the credit they ask for rather
     * than a sentence of ours — the one deliberate exception to the
     * Finnish-only rule, and it is a proper noun either way.
     */
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "Data provided by football-data.org"
    );
  });

  it("is a labelled landmark, so it is not just loose links at the bottom", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sivuston tiedot" })).toBeInTheDocument();
  });
});
