import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NationalTeams, { metadata } from "@/app/national-teams/page";
import { competitionsInRegion } from "@/lib/competitions";

describe("National teams page (competition picker)", () => {
  it("shows the Finnish heading", () => {
    render(<NationalTeams />);

    expect(screen.getByRole("heading", { name: "Valitse kilpailu" })).toBeInTheDocument();
    expect(metadata.title).toBe("Valitse kilpailu");
  });

  it("lists only the national-team competitions, with Huuhkajat last", () => {
    render(<NationalTeams />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.textContent)).toEqual(["MM-kisat", "EM-kisat", "Huuhkajat"]);
  });

  /**
   * Huuhkajat is TASO-backed and has no standings page, so it is neither in
   * `SUPPORTED_COMPETITIONS` nor linked like the two football-data
   * tournaments. See specs/017-huuhkajat.md.
   */
  it("links Huuhkajat to its own page rather than to a standings page", () => {
    render(<NationalTeams />);

    // The icon's alt text joins the accessible name, so match on the label.
    const huuhkajat = screen.getByRole("link", { name: /Huuhkajat$/ });
    expect(huuhkajat).toHaveAttribute("href", "/maajoukkueet/huuhkajat");
    expect(huuhkajat.getAttribute("href")).not.toContain("kilpailu=");
  });

  it("keeps Huuhkajat out of the football-data competition list", () => {
    expect(competitionsInRegion("national-teams").map((c) => c.name)).toEqual([
      "MM-kisat",
      "EM-kisat",
    ]);
  });

  it("gives Huuhkajat the Finnish flag", () => {
    render(<NationalTeams />);

    const icon = screen.getByRole("link", { name: /Huuhkajat$/ }).querySelector("img");
    expect(icon).toHaveAttribute("src", "/finland.svg");
    expect(icon).toHaveAttribute("alt", "Suomi");
  });

  it("links each one into its own region, not into Ulkomaat", () => {
    render(<NationalTeams />);

    for (const competition of competitionsInRegion("national-teams")) {
      const link = screen
        .getAllByRole("link")
        .find(
          (element) =>
            element.getAttribute("href") ===
            `/maajoukkueet/sarjataulukko?kilpailu=${competition.code}`
        );
      expect(link).toHaveTextContent(competition.name);
    }
  });

  it("gives each competition an icon with its area as alt text", () => {
    render(<NationalTeams />);

    const worldCup = screen
      .getAllByRole("link")
      .find((element) => element.getAttribute("href")?.includes("kilpailu=WC"));
    const icon = worldCup?.querySelector("img");
    expect(icon).toHaveAttribute("alt", "Maailma");
    // The World area has no provider flag, so this is a local asset.
    expect(icon).toHaveAttribute("src", "/fifa.svg");
    // A 3:1 wordmark in a 3:2 slot must not be stretched.
    expect(icon?.className).toContain("object-contain");
  });
});
