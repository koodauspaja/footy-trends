import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  it("shows a link back to the front page", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Etusivu" })).toHaveAttribute("href", "/");
  });
});
