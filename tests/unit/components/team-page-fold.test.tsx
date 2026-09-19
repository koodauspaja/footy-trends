import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MATCHES_HEADING, TeamPageFold } from "@/components/team-page-fold";

function renderFold(props: Partial<Parameters<typeof TeamPageFold>[0]> = {}) {
  return render(
    <TeamPageFold heading="Ottelut" headingId="team-matches" {...props}>
      <p>Sisältö</p>
    </TeamPageFold>
  ).container;
}

describe("TeamPageFold", () => {
  it("starts open, so nothing is hidden until the reader hides it", () => {
    const details = renderFold().querySelector("details");

    expect(details?.open).toBe(true);
    expect(screen.getByText("Sisältö")).toBeVisible();
  });

  it("folds with no client state: a native details element", () => {
    const container = renderFold();

    expect(container.querySelector("details > summary")).not.toBeNull();
    expect(container.querySelector("details > p")?.textContent).toBe("Sisältö");
  });

  it("names its region by the heading inside the summary", () => {
    const container = renderFold();
    const heading = screen.getByRole("heading", { level: 2, name: "Ottelut" });

    expect(container.querySelector("summary")).toContainElement(heading);
    expect(screen.getByRole("region", { name: "Ottelut" })).toBeInTheDocument();
    expect(heading.id).toBe("team-matches");
  });

  it("shows the count in brackets after the heading", () => {
    const summary = renderFold({ count: "38 ottelua" }).querySelector("summary");

    expect(summary?.textContent).toBe("▸Ottelut(38 ottelua)");
  });

  it("shows no brackets without a count", () => {
    expect(renderFold().querySelector("summary")?.textContent).toBe("▸Ottelut");
  });

  it("marks the summary as pressable, hidden from screen readers", () => {
    // `<details>` already announces whether it is open; the marker is for eyes.
    const marker = renderFold().querySelector("summary > span");

    expect(marker?.getAttribute("aria-hidden")).toBe("true");
    expect(marker?.getAttribute("class")).toContain("group-open:rotate-90");
  });

  it("takes the page's spacing, by default the sections'", () => {
    expect(renderFold().querySelector("section")?.getAttribute("class")).toBe("mt-8");
    expect(renderFold({ className: "mt-4" }).querySelector("section")?.getAttribute("class")).toBe(
      "mt-4"
    );
  });

  it("names the match list as agreed on #416", () => {
    expect(MATCHES_HEADING).toBe("Ottelut");
  });
});
