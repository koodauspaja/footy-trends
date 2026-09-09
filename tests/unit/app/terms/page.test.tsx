import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Terms, { metadata } from "@/app/terms/page";

/**
 * The terms of service, from #303.
 *
 * Two of these assert something the page deliberately does *not* say. The
 * providers' positions differ — football-data.org publishes a permission the app
 * meets, while the TASO arrangement is an open question (#307) — so the page
 * attributes both and claims a licence from neither.
 */
describe("the terms of service", () => {
  it("renders without a session, because Google requires it reachable signed out", () => {
    render(<Terms />);

    expect(screen.getByRole("heading", { name: "Käyttöehdot", level: 1 })).toBeVisible();
  });

  it("attributes football-data.org, by name and by link", () => {
    // Their FAQ asks for a visible credit. In Finnish, per CLAUDE.md.
    render(<Terms />);

    expect(document.body.textContent).toContain("tiedot tarjoaa");
    expect(screen.getByRole("link", { name: "football-data.org" })).toHaveAttribute(
      "href",
      "https://www.football-data.org/"
    );
  });

  it("names Palloliitto as the source of domestic data", () => {
    render(<Terms />);

    expect(document.body.textContent).toContain("Suomen Palloliiton tulospalvelu");
  });

  it("claims no licence or permission from either provider", () => {
    /**
     * The page says where the data comes from and that the rights are theirs.
     * It does not say the app has an agreement, because for TASO there is not
     * one — see #307. Asserting a permission nobody granted would be worse than
     * silence, so this test fails if such a claim appears.
     */
    render(<Terms />);

    const body = document.body.textContent ?? "";
    /**
     * Stems rather than whole words, because Finnish inflects: `luvalla`,
     * `luvan`, `lisenssi`, `lisenssin`, `sopimuksella` are all the same claim
     * wearing different endings, and a list of exact strings would miss most of
     * them.
     *
     * `lupa` is listed separately from `luva` because of consonant gradation —
     * the nominative keeps its `p` and the inflected forms do not, so a stem
     * list built from `luvalla` alone lets "Meillä on lupa" straight through.
     *
     * Anchored at a word start, because the unanchored version matched
     * `kuuluvat` — "belong to", which is the opposite claim and the very
     * sentence this test wants the page to keep.
     *
     * A guard, not a proof: no pattern catches every way of implying
     * permission. The assertion carrying the weight is the positive one below,
     * that the page says the rights belong to the providers.
     */
    expect(body).not.toMatch(/\b(lupa|luva|lisenss|sopimukse)/i);
    expect(body).toContain("oikeudet niihin");
  });

  it("warns that seasons older than the current one are never refetched", () => {
    /**
     * A real limit of the app, not boilerplate: a points deduction applied to a
     * past season after we synced will not appear, which is why #150 exists.
     *
     * The wording matters and review caught it wrong. `needsRefresh` stops
     * refreshing when `seasonId < activeSeasonId` — *older than the current
     * one*, not *finished*. A season that has ended but is still the newest
     * keeps refreshing on the interval, so "päättyneen kauden" claimed a limit
     * the app does not have.
     */
    render(<Terms />);

    expect(document.body.textContent).toContain("vanhempien kausien tietoja ei haeta uudelleen");
  });

  it("points at deletion and at the privacy policy", () => {
    render(<Terms />);

    expect(screen.getByRole("link", { name: "Asetukset" })).toHaveAttribute("href", "/asetukset");
    expect(screen.getByRole("link", { name: "tietosuojaselosteessa" })).toHaveAttribute(
      "href",
      "/tietosuoja"
    );
  });

  it("has a title of its own", () => {
    expect(metadata.title).toBe("Käyttöehdot");
  });
});
