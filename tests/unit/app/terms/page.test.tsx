import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Terms, { metadata } from "@/app/terms/page";

/**
 * The terms of service page. It names both providers as the source of the data.
 * Two tests assert something it deliberately does not say: that the app holds a
 * licence from either.
 *
 * decisions/303-terms-and-attribution.md
 * decisions/029-forced-season-refresh.md
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

  it("splits the two sources the way the code actually does", () => {
    // `/maajoukkueet` mixes both providers, as `national-team.ts` says:
    // Huuhkajat's and Helmarit's own matches come from Palloliitto, and only
    // the tournaments (MM, EM) come from football-data.org.
    render(<Terms />);

    const body = document.body.textContent ?? "";
    expect(body).toContain("Ulkomaiset sarjat ja arvokisat");
    expect(body).toContain("Huuhkajien ja Helmarien ottelut");
    expect(body).toContain("Suomen Palloliiton tulospalvelu");
    // And the case that broke both earlier attempts: the national-team pages
    // are not one provider's or the other's, they are both.
    expect(body).toContain("Maajoukkuesivuilla on tietoja molemmista lähteistä");
  });

  it("claims no licence or permission from either provider", () => {
    // The page says where the data comes from and that the rights are theirs.
    // It does not say the app has an agreement, because for TASO there is none:
    // asserting a permission nobody granted would be worse than silence.
    render(<Terms />);

    const body = document.body.textContent ?? "";
    // Stems, because Finnish inflects, and `lupa` beside `luva` because of consonant gradation.
    // Anchored at a word start: unanchored it matches `kuuluvat`, "belong to", the sentence the
    // page must keep. A guard, not a proof: the positive assertion below carries the weight.
    expect(body).not.toMatch(/\b(lupa|luva|lisenss|sopimukse)/i);
    expect(body).toContain("oikeudet niihin");
  });

  it("warns that seasons older than the current one are never refetched", () => {
    // A real limit of the app: a points deduction applied to a past season after it was
    // synced will not appear. `needsRefresh` stops when `seasonId < activeSeasonId`, older
    // than the current one and not merely finished, and the wording has to say that.
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
