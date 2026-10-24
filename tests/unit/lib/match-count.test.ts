import { describe, expect, it } from "vitest";
import { matchCountLabel } from "@/lib/match-count";

/**
 * The Finnish count of matches, the one rule every caller shares.
 *
 * decisions/017-huuhkajat.md
 * decisions/036-halftime-comebacks.md
 */
describe("matchCountLabel", () => {
  it("uses the singular for one match", () => {
    expect(matchCountLabel(1)).toBe("1 ottelu");
  });

  it("uses the partitive for any other count, zero included", () => {
    expect(matchCountLabel(0)).toBe("0 ottelua");
    expect(matchCountLabel(4)).toBe("4 ottelua");
    expect(matchCountLabel(12)).toBe("12 ottelua");
    expect(matchCountLabel(33)).toBe("33 ottelua");
  });
});
