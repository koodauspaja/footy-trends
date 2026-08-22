import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Ulkomaat, { metadata } from "@/app/ulkomaat/page";
import { SUPPORTED_COMPETITIONS } from "@/lib/competitions";

describe("Ulkomaat page (competition picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Ulkomaat />);

    expect(screen.getByRole("heading", { name: "Valitse kilpailu" })).toBeInTheDocument();
  });

  it("lists every supported competition, each linking to its standings page", () => {
    render(<Ulkomaat />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(SUPPORTED_COMPETITIONS.length);
    SUPPORTED_COMPETITIONS.forEach((competition) => {
      const link = links.find(
        (element) => element.getAttribute("href") === `/sarjataulukko?kilpailu=${competition.code}`
      );
      expect(link).toHaveTextContent(competition.name);
    });
  });

  it("shows each competition's national flag with the country as alt text", () => {
    render(<Ulkomaat />);

    const premierLeague = SUPPORTED_COMPETITIONS.find((competition) => competition.code === "PL");
    if (!premierLeague) throw new Error("Expected Premier League to be a supported competition");

    const link = screen
      .getAllByRole("link")
      .find((element) => element.getAttribute("href") === "/sarjataulukko?kilpailu=PL");
    if (!link) throw new Error("Expected a link to the Premier League standings page");
    const flag = link.querySelector("img");
    expect(flag).toHaveAttribute("alt", premierLeague.country);
    expect(flag).toHaveAttribute("src", premierLeague.flagUrl);
  });

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse kilpailu");
  });
});
