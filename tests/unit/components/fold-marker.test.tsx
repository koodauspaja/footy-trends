import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FoldMarker } from "@/components/fold-marker";

/**
 * The marker that shows a fold open or closed.
 *
 * decisions/419-shared-fold-marker.md
 * decisions/071-section-toggles.md
 */

describe("FoldMarker", () => {
  it("points right, and turns when its own details element opens", () => {
    const marker = render(<FoldMarker />).container.querySelector("span");

    expect(marker?.textContent).toBe("▸");
    // Only its own: `group-open` would also turn it inside any open ancestor.
    expect(marker?.getAttribute("class")).toContain("[details[open]>summary>&]:rotate-90");
    expect(marker?.getAttribute("class")).not.toContain("group-open");
  });

  it("is hidden from screen readers, which the details element already tells", () => {
    const marker = render(<FoldMarker />).container.querySelector("span");

    expect(marker?.getAttribute("aria-hidden")).toBe("true");
  });
});
