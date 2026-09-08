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
  it("prefers the reader's own picture, with the token in the URL", () => {
    // The image is served `private, immutable` for a year on a path shared by
    // every reader, so the token both busts the cache on a new upload and keeps
    // one reader's cached picture off another's URL.
    expect(avatarSourceOf({ avatarVersion: "3f6c1a2e-9b40" }, GOOGLE)).toBe(
      "/api/avatar/me?v=3f6c1a2e-9b40"
    );
  });

  it("escapes the token rather than trusting its shape", () => {
    expect(avatarSourceOf({ avatarVersion: "a b&c" }, GOOGLE)).toBe("/api/avatar/me?v=a%20b%26c");
  });

  it("falls back to Google's picture, and then to nothing", () => {
    expect(avatarSourceOf({ avatarVersion: null }, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf({ avatarVersion: null }, null)).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["a number", 1757325600000],
    ["null", null],
    ["an object", {}],
  ])("ignores a version that is %s and uses Google's picture", (_case, avatarVersion) => {
    // Each of these would still build a URL the handler would answer — with a
    // cache key shared by everyone else who had one.
    expect(avatarSourceOf({ avatarVersion }, GOOGLE)).toBe(GOOGLE);
  });

  it("survives a session that is null or not an object", () => {
    expect(avatarSourceOf(null, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf(undefined, GOOGLE)).toBe(GOOGLE);
    expect(avatarSourceOf("signed-in", GOOGLE)).toBe(GOOGLE);
  });
});
