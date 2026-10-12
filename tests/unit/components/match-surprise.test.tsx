import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredMatch } from "@/lib/match-service";

/**
 * The line under a finished match's score: what it says, and that nothing is
 * read or shown signed out.
 *
 * decisions/057-surprise-index.md
 */

const { canSeeAnalytics, getMatchSurprise } = vi.hoisted(() => ({
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
  getMatchSurprise: vi.fn<(stored: StoredMatch) => Promise<number | null>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
vi.mock("@/lib/surprise-service", () => ({ getMatchSurprise }));

import { MatchSurprise, matchSurpriseSentence } from "@/components/match-surprise";

const stored = { source: "taso", match: { providerMatchId: 5 } } as unknown as StoredMatch;

beforeEach(() => {
  canSeeAnalytics.mockReset().mockResolvedValue(true);
  getMatchSurprise.mockReset().mockResolvedValue(0.08);
});

describe("MatchSurprise", () => {
  it("says what Elo gave the result, as a whole percent", async () => {
    const { container } = render(<div>{await MatchSurprise({ stored })}</div>);

    expect(matchSurpriseSentence(0.084)).toBe("Elo antoi tälle tulokselle 8\u00a0%.");
    expect(container.textContent).toBe("Elo antoi tälle tulokselle 8\u00a0%.");
    expect(getMatchSurprise).toHaveBeenCalledWith(stored);
  });

  it("shows nothing for a match without a figure", async () => {
    getMatchSurprise.mockResolvedValue(null);

    expect(await MatchSurprise({ stored })).toBeNull();
  });

  it("reads nothing and shows nothing signed out", async () => {
    canSeeAnalytics.mockResolvedValue(false);

    expect(await MatchSurprise({ stored })).toBeNull();
    expect(getMatchSurprise).not.toHaveBeenCalled();
  });
});
