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

  it("names every table that stores personal data", () => {
    render(<Privacy />);

    // `user`, `account`, `session`, `user_preferences`, `user_avatar` and the
    // two favourite tables — in the reader's language rather than the schema's.
    const body = document.body.textContent ?? "";
    for (const claim of [
      "sähköpostiosoite",
      "kirjautumistunnisteet",
      "Istunnot",
      "oletussarjat",
      "profiilikuva",
      "Suosikkijoukkueesi",
    ]) {
      expect(body).toContain(claim);
    }
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

  it("has a title of its own", () => {
    expect(metadata.title).toBe("Tietosuojaseloste");
  });
});
