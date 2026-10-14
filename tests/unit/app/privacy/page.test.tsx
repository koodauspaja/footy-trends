import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Privacy, { metadata } from "@/app/privacy/page";

/**
 * The privacy policy page. The assertions are about the claims, not the prose:
 * each names a fact the code has to keep true, so changing the code without
 * this page fails here.
 *
 * decisions/302-privacy-policy-and-footer.md
 * decisions/024-account-settings.md
 */

describe("the privacy policy", () => {
  it("renders without a session, because Google requires it reachable signed out", () => {
    // No mocks: if this page ever reads a session, this test stops compiling or
    // starts throwing, which is the point.
    render(<Privacy />);

    expect(screen.getByRole("heading", { name: "Tietosuojaseloste", level: 1 })).toBeVisible();
  });

  // One row per thing the schema stores, so a column added without a sentence here fails. The
  // phrases are specific: "profiilikuva" alone would be satisfied by the Google picture and
  // hide the uploaded one, and "Suosikkijoukkueesi" alone would hide favourite competitions.
  it.each([
    ["user.name", "Nimi"],
    ["user.email", "sähköpostiosoite"],
    ["user.image", "Google-profiilikuvasi osoite"],
    ["account (Google's tokens)", "Googlen antamat kirjautumistunnisteet"],
    ["session.userAgent", "millä selaimella"],
    ["user_preferences.defaultRegion", "aloitusnäkymä"],
    ["user_preferences.defaultCompetition*", "oletussarjat"],
    ["user_avatar", "Itse lataamasi profiilikuva"],
    ["favorite_team", "Suosikkijoukkueesi"],
    ["favorite_competition", "-sarjasi"],
  ])("describes what %s stores", (_column, phrase) => {
    render(<Privacy />);

    expect(document.body.textContent).toContain(phrase);
  });

  it("names each third party that receives data", () => {
    render(<Privacy />);

    const body = document.body.textContent ?? "";
    for (const processor of ["Google", "Railway", "Sentry", "Axiom"]) {
      expect(body).toContain(processor);
    }
  });

  it("says the log store can hold a user id, because it can", () => {
    // `favourites.ts` and `preferences.ts` both log `{ userId }` on their error
    // paths. Claiming nothing identifying reaches Axiom would be false.
    render(<Privacy />);

    expect(document.body.textContent).toContain("käyttäjätunnisteesi");
  });

  it("points at the deletion that actually exists", () => {
    // `Poista tili` ships, and the cascades are covered by an integration test,
    // so the page can promise it as fact.
    render(<Privacy />);

    expect(screen.getAllByRole("link", { name: "Asetukset" }).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Poista tili");
  });

  it("does not claim deletion reaches the log store, because it does not", () => {
    // Account deletion cascades through our database and cannot reach entries
    // Axiom already holds, so the page may not promise otherwise. The id is a
    // random string: once the account is gone, nothing connects it to a person.
    render(<Privacy />);

    const body = document.body.textContent ?? "";
    expect(body).toContain("Poikkeuksena lokit");
    expect(body).toContain("eikä sitä voi yhdistää");
  });

  it("names a contact address, which a policy needs", () => {
    render(<Privacy />);

    expect(screen.getByRole("link", { name: "info@koodauspaja.fi" })).toHaveAttribute(
      "href",
      "mailto:info@koodauspaja.fi"
    );
  });

  it("has a title of its own", () => {
    expect(metadata.title).toBe("Tietosuojaseloste");
  });
});
