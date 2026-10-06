import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "@/app/not-found";

/**
 * The page for an address nothing answers, and for every `notFound()`. Next's
 * default is in English, which is what readers met until #533.
 */
describe("Not-found page", () => {
  it("says in Finnish that the page does not exist", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Sivua ei löytynyt" })
    ).toBeInTheDocument();
    expect(screen.getByText("Etsimääsi sivua ei ole olemassa.")).toBeInTheDocument();
  });

  it("offers the way home", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Etusivulle" })).toHaveAttribute("href", "/");
  });

  it("titles the tab as the page is headed", () => {
    expect(metadata).toEqual({ title: "Sivua ei löytynyt" });
  });

  it("shows nothing of Next's English default, and no status code", () => {
    const { container } = render(<NotFound />);

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/could not be found|not found/i);
    expect(text).not.toMatch(/\b404\b/);
  });

  /**
   * The admin area answers a reader it does not know with `notFound()`, so
   * that its pages cannot be told from ones that do not exist (specs/028).
   * This page is what they see, so it may name nothing about where they were.
   */
  it("gives nothing away about the admin area, which renders it on purpose", () => {
    const { container } = render(<NotFound />);

    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["ylläpito", "käyttäjä", "kirjaudu", "oikeu"]) {
      expect(text).not.toContain(word);
    }
  });
});
