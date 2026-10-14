import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * `RowLink`. `next/link`'s prefetch setting leaves no mark in the DOM, so the
 * link is replaced by one that shows what it was given: that prop is the point,
 * with everything else passing through.
 *
 * decisions/489-row-links-not-prefetched.md
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

describe("RowLink", () => {
  it("never prefetches, and passes everything else through", async () => {
    const { RowLink } = await import("@/components/row-link");
    render(
      <RowLink className="hover:underline" href="/kotimaa/joukkue/60987" title="Voitto">
        HJK
      </RowLink>
    );

    const link = screen.getByRole("link", { name: "HJK" });
    expect(link).toHaveAttribute("data-prefetch", "false");
    expect(link).toHaveAttribute("href", "/kotimaa/joukkue/60987");
    expect(link).toHaveAttribute("title", "Voitto");
    expect(link).toHaveClass("hover:underline");
  });
});
