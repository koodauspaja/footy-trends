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

  it("lists only the national-team competitions", () => {
    render(<NationalTeams />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.textContent)).toEqual(["MM-kisat", "EM-kisat"]);
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
