import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";
import Home from "@/app/page";
import { SUPPORTED_COMPETITIONS } from "@/lib/competitions";

describe("Home page (competition picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Valitse kilpailu" })).toBeInTheDocument();
  });

  it("lists every supported competition, each linking to its standings page", () => {
    render(<Home />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(SUPPORTED_COMPETITIONS.length);
    SUPPORTED_COMPETITIONS.forEach((competition, index) => {
      expect(links[index]).toHaveTextContent(competition.name);
      expect(links[index]).toHaveAttribute("href", `/sarjataulukko?kilpailu=${competition.code}`);
    });
  });

  it("shows each competition's national flag with the country as alt text", () => {
    render(<Home />);

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
});

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan sarjataulukkoa...")).toBeInTheDocument();
  });
});
