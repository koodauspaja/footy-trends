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

  it("attributes football-data.org in their own wording", () => {
    // "Data provided by football-data.org", which their FAQ asks for.
    render(<Terms />);

    expect(document.body.textContent).toContain("data provided by");
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
    for (const claim of ["luvalla", "lisenssi", "sopimuksen mukaisesti"]) {
      expect(body).not.toContain(claim);
    }
    expect(body).toContain("oikeudet niihin");
  });

  it("warns that a finished season is never refetched", () => {
    // A real limit of the app, not boilerplate: a points deduction applied
    // after we synced will not appear, which is why #150 exists.
    render(<Terms />);

    expect(document.body.textContent).toContain("päättyneen kauden tietoja ei haeta");
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
