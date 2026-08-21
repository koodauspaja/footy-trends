import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";
import Home, { metadata } from "@/app/page";

describe("Home page (region picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Valitse alue" })).toBeInTheDocument();
  });

  it("links to the domestic and international sections", () => {
    render(<Home />);

    const kotimaa = screen.getByRole("link", { name: /Kotimaa/ });
    expect(kotimaa).toHaveAttribute("href", "/kotimaa");

    const ulkomaat = screen.getByRole("link", { name: /Ulkomaat/ });
    expect(ulkomaat).toHaveAttribute("href", "/ulkomaat");
  });

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse alue");
  });
});

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan sarjataulukkoa...")).toBeInTheDocument();
  });
});
