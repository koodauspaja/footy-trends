import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FoldMarker } from "@/components/fold-marker";

describe("FoldMarker", () => {
  it("points right, and turns when its details element opens", () => {
    const marker = render(<FoldMarker />).container.querySelector("span");

    expect(marker?.textContent).toBe("▸");
    // `group-open` needs `group` on the details element; each fold sets it.
    expect(marker?.getAttribute("class")).toContain("group-open:rotate-90");
  });

  it("is hidden from screen readers, which the details element already tells", () => {
    const marker = render(<FoldMarker />).container.querySelector("span");

    expect(marker?.getAttribute("aria-hidden")).toBe("true");
  });
});
