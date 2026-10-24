import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewSwitch } from "@/components/view-switch";

/**
 * `ViewSwitch`: a link per view, the chosen one filled and marked current.
 * links-and-switches.spec.ts measures how it is painted.
 *
 * decisions/701-links-and-switches.md
 */

const OPTIONS = [
  { label: "Kotimaa", href: "/ennusteet", current: true },
  { label: "Ulkomaat", href: "/ennusteet?alue=ulkomaat", current: false },
];

describe("ViewSwitch", () => {
  it("links every view and marks only the chosen one current", () => {
    render(<ViewSwitch options={OPTIONS} />);

    expect(screen.getByRole("link", { name: "Kotimaa" })).toHaveAttribute("aria-current", "page");
    const other = screen.getByRole("link", { name: "Ulkomaat" });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other).toHaveAttribute("href", "/ennusteet?alue=ulkomaat");
  });

  it("fills the chosen view only, inside one bordered group", () => {
    render(<ViewSwitch options={OPTIONS} />);

    expect(screen.getByRole("link", { name: "Kotimaa" })).toHaveClass(
      "bg-foreground",
      "text-background"
    );
    const other = screen.getByRole("link", { name: "Ulkomaat" });
    expect(other).not.toHaveClass("bg-foreground");
    expect(other).toHaveClass("hover:bg-surface");
    expect(screen.getByRole("list")).toHaveClass("border", "border-border");
  });
});
