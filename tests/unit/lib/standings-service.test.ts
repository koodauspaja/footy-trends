import { describe, expect, it, vi } from "vitest";
import { needsRefresh } from "@/lib/standings-service";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/redis", () => ({ redis: {} }));

const ACTIVE_SEASON = 2025;
const PAST_SEASON = 2024;
/** Matches the FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS default of one hour. */
const REFRESH_INTERVAL_MS = 3600 * 1000;

function storedAt(msAgo: number) {
  return [{ updatedAt: new Date(Date.now() - msAgo) }];
}

describe("needsRefresh", () => {
  it("refreshes when nothing is stored for the season", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, [])).toBe(true);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [])).toBe(true);
  });

  it("never refreshes a past season that has stored matches, however stale", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(0))).toBe(false);
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 24))).toBe(
      false
    );
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 24 * 365))).toBe(
      false
    );
  });

  it("keeps fresh active-season data without refreshing", () => {
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(0))).toBe(false);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS / 2))).toBe(
      false
    );
  });

  it("refreshes the active season once the threshold has elapsed", () => {
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS))).toBe(true);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 2))).toBe(
      true
    );
  });
});
