import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";

/**
 * The root loading state.
 *
 * decisions/179-generic-loading-text.md
 */

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan...")).toBeInTheDocument();
  });

  // It is the root loading state, so it appears over match lists, team pages
  // and region pickers as well as standings: it may name nothing a page might
  // not show.
  it("names nothing the page it covers might not render", () => {
    render(<Loading />);

    const text = screen.getByText(/Ladataan/).textContent ?? "";
    for (const thing of ["sarjataulukko", "ottelu", "joukkue", "kilpailu"]) {
      expect(text.toLowerCase()).not.toContain(thing);
    }
  });
});
