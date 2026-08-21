import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Kotimaa, { metadata } from "@/app/kotimaa/page";
import { KOTIMAA_COMPETITIONS } from "@/lib/kotimaa-competitions";

describe("Kotimaa page (competition picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Kotimaa />);

    expect(screen.getByRole("heading", { name: "Valitse kilpailu" })).toBeInTheDocument();
  });

  it("lists every domestic competition, each linking to its own /kotimaa standings page", () => {
    render(<Kotimaa />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(KOTIMAA_COMPETITIONS.length);
    KOTIMAA_COMPETITIONS.forEach((competition) => {
      const link = links.find(
        (element) =>
          element.getAttribute("href") === `/kotimaa/sarjataulukko?kilpailu=${competition.code}`
      );
      expect(link).toHaveTextContent(competition.name);
    });
  });

  it("includes Veikkausliiga", () => {
    render(<Kotimaa />);

    expect(screen.getByRole("link", { name: /Veikkausliiga/ })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL"
    );
  });

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse kilpailu");
  });
});
