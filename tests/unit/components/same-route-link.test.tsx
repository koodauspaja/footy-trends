import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * `next/link`'s prefetch setting leaves no mark in the DOM, so the link is
 * replaced by one that shows what it was given.
 * `decisions/189-same-route-links.md`
 */
vi.mock("next/link", () => ({
  default: ({
    prefetch,
    href,
    children,
    ...rest
  }: {
    prefetch?: boolean | null;
    href: string;
    children: React.ReactNode;
  }) => (
    <a data-prefetch={String(prefetch)} href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("SameRouteLink", () => {
  it("never prefetches, and passes everything else through", async () => {
    const { SameRouteLink } = await import("@/components/same-route-link");
    render(
      <SameRouteLink
        aria-current="page"
        className="font-semibold"
        href="/ennusteet?alue=ulkomaat&tyyppi=ennakkoon"
      >
        Ulkomaat
      </SameRouteLink>
    );

    const link = screen.getByRole("link", { name: "Ulkomaat" });
    expect(link).toHaveAttribute("data-prefetch", "false");
    expect(link).toHaveAttribute("href", "/ennusteet?alue=ulkomaat&tyyppi=ennakkoon");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("font-semibold");
  });
});
