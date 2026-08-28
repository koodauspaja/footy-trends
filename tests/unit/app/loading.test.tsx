import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan...")).toBeInTheDocument();
  });

  /**
   * It is the root loading state, so it appears over match lists, team pages
   * and region pickers as well as standings. Naming a standings table there
   * told the reader the app was fetching something the page never shows.
   * See #179.
   */
  it("names nothing the page it covers might not render", () => {
    render(<Loading />);

    const text = screen.getByText(/Ladataan/).textContent ?? "";
    for (const thing of ["sarjataulukko", "ottelu", "joukkue", "kilpailu"]) {
      expect(text.toLowerCase()).not.toContain(thing);
    }
  });
});
