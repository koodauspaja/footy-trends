import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Domestic, { metadata } from "@/app/domestic/page";
import { DOMESTIC_COMPETITIONS } from "@/lib/domestic-competitions";

/**
 * The favourite star inside this tree calls `useSession`. The real client opens
 * a broadcast channel whose nanostores cleanup runs a second *after* the last
 * unsubscribe — by which time this file's jsdom is gone, so it throws
 * `window is not defined` as an uncaught exception inside whichever file
 * happens to be running then. Signed out is what these tests already assumed;
 * this just says so without starting a timer (specs/026-favourites.md).
 */
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null, refetch: vi.fn() }),
}));

describe("Domestic page (competition picker)", () => {
  it("shows the Finnish heading", () => {
    render(<Domestic />);

    expect(screen.getByRole("heading", { name: "Valitse kilpailu" })).toBeInTheDocument();
  });

  it("lists every domestic competition, each linking to its own /kotimaa standings page", () => {
    render(<Domestic />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(DOMESTIC_COMPETITIONS.length);
    DOMESTIC_COMPETITIONS.forEach((competition) => {
      const link = links.find(
        (element) =>
          element.getAttribute("href") === `/kotimaa/sarjataulukko?kilpailu=${competition.code}`
      );
      expect(link).toHaveTextContent(competition.name);
    });
  });

  it("includes Veikkausliiga", () => {
    render(<Domestic />);

    expect(screen.getByRole("link", { name: /Veikkausliiga/ })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL"
    );
  });

  it("sets the browser tab title to match the heading", () => {
    expect(metadata.title).toBe("Valitse kilpailu");
  });
});
