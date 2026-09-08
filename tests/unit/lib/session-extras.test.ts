import { describe, expect, it } from "vitest";
import { avatarSourceOf, defaultRegionOf } from "@/lib/session-extras";

/**
 * Reading the fields `customSession` adds, from specs/024-account-settings.md
 * and specs/025-custom-avatar.md.
 *
 * These arrive untyped — better-auth's browser client knows nothing about
 * server-side plugins — so every case here is a value the server could send and
 * the client must survive.
 */

const GOOGLE = "https://lh3.googleusercontent.com/a/matti";

describe("defaultRegionOf", () => {
  it("returns one of the three regions", () => {
    expect(defaultRegionOf({ defaultRegion: "ulkomaat" })).toBe("ulkomaat");
  });

  it.each([
    ["a region the app no longer has", { defaultRegion: "eurooppa" }],
    ["a non-string", { defaultRegion: 42 }],
    ["no field at all", {}],
    ["no session", null],
    ["a session that is not an object", "signed-in"],
  ])("returns null for %s", (_case, session) => {
    // A stored region that no longer means anything must leave the reader on
    // the picker rather than redirect them somewhere that does not exist.
    expect(defaultRegionOf(session)).toBeNull();
  });
});

describe("avatarSourceOf", () => {
  it("prefers the reader's own picture, with the version in the URL", () => {
    // The image is served `immutable` for a year, so the version has to be in
    // the URL or a new upload would never be fetched.
    expect(avatarSourceOf({ avatarVersion: 1757325600000 }, GOOGLE)).toBe(
      "/api/avatar/me?v=1757325600000"
    );
  });

  it("falls back to Google's picture, and then to nothing", () => {
    expect(avatarSourceOf({ avatarVersion: null }, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf({ avatarVersion: null }, null)).toBeNull();
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["infinite", Number.POSITIVE_INFINITY],
    ["not a number", "1757325600000"],
    ["NaN", Number.NaN],
  ])("ignores a version that is %s and uses Google's picture", (_case, avatarVersion) => {
    // Each of these would still build a URL the handler would answer — and a
    // cache key nothing could ever invalidate.
    expect(avatarSourceOf({ avatarVersion }, GOOGLE)).toBe(GOOGLE);
  });

  it("survives a session that is null or not an object", () => {
    expect(avatarSourceOf(null, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf(undefined, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf("signed-in", GOOGLE)).toBe(GOOGLE);
  });
});
