import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Privacy, { metadata } from "@/app/privacy/page";

/**
 * The privacy policy page, from #302.
 *
 * These assertions are about the **claims**, not the prose. Each one names a
 * fact the code has to keep true, so that changing the code without changing
 * this page fails here rather than silently making the policy a lie.
 */
describe("the privacy policy", () => {
  it("renders without a session, because Google requires it reachable signed out", () => {
    // No mocks: if this page ever reads a session, this test stops compiling or
    // starts throwing, which is the point.
    render(<Privacy />);

    expect(screen.getByRole("heading", { name: "Tietosuojaseloste", level: 1 })).toBeVisible();
  });

  /**
   * One row per thing the schema stores, so a column added without a sentence
   * here fails rather than quietly making the policy incomplete.
   *
   * The phrases are specific on purpose: "profiilikuva" alone would be
   * satisfied by the *Google* picture and hide the uploaded one, and
   * "Suosikkijoukkueesi" alone would hide favourite competitions.
   */
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
    // specs/024 ships `Poista tili`, and the cascades are covered by an
    // integration test — so the page can promise it as fact.
    render(<Privacy />);

    expect(screen.getAllByRole("link", { name: "Asetukset" }).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Poista tili");
  });

  it("does not claim deletion reaches the log store, because it does not", () => {
    /**
     * Account deletion cascades through our database. It cannot reach entries
     * Axiom already holds, and a page promising otherwise would be false for
     * every reader who ever hit an error path.
     *
     * What makes that acceptable is the second half: the id is a random string,
     * so once the account it referred to is gone, nothing can connect it to a
     * person.
     */
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
