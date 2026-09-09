import { describe, expect, it } from "vitest";
import { describeDevice, describeLastUsed } from "@/lib/user-agent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

describe("describeDevice", () => {
  it.each([
    // Every one of these contains the name of a browser further down the list.
    // Order is the whole trick, so each case pins one rung of it.
    ["Edge over Chrome and Safari", EDGE_WINDOWS, "Edge-selain"],
    ["Chrome over Safari", CHROME_MAC, "Chrome-selain"],
    ["Safari when nothing else matches", SAFARI_MAC, "Safari-selain"],
    ["Firefox-selain", FIREFOX_LINUX, "Firefox-selain"],
    ["Safari on a phone", SAFARI_IPHONE, "Safari-selain"],
    ["Chrome on Android", CHROME_ANDROID, "Chrome-selain"],
  ])("picks %s", (_case, userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it("never names an operating system", () => {
    // Confirmed with Miikka: the OS put two English product names in a Finnish
    // UI to say what the browser already says.
    for (const userAgent of [CHROME_MAC, EDGE_WINDOWS, SAFARI_IPHONE, CHROME_ANDROID]) {
      expect(describeDevice(userAgent)).not.toMatch(/macOS|Windows|iOS|Android|Linux|·/);
    }
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["unrecognisable", "curl/8.4.0"],
  ])("falls back to Finnish for a %s user agent", (_case, userAgent) => {
    // Never the raw string: the row exists to be recognised at a glance, and
    // 200 characters of `Mozilla/5.0 (…)` is not that.
    expect(describeDevice(userAgent)).toBe("Tuntematon selain");
  });

  it("names the browser whatever the platform", () => {
    expect(describeDevice("Mozilla/5.0 (Unknown) Firefox/130.0")).toBe("Firefox-selain");
  });

  it("wraps every label in the same Finnish word as the fallback", () => {
    // `Tuntematon selain` was always Finnish; a bare `Chrome` beside it was the
    // inconsistency. The brand cannot be translated, the word around it can.
    for (const userAgent of [CHROME_MAC, EDGE_WINDOWS, SAFARI_MAC, FIREFOX_LINUX]) {
      expect(describeDevice(userAgent)).toMatch(/-selain$/);
    }
  });
});

describe("describeLastUsed", () => {
  // UTC instants throughout, so these assert Helsinki behaviour rather than
  // whatever timezone the machine running them happens to be in.
  const noonUtc = new Date("2026-09-07T09:00:00Z");

  it("says today for the same calendar day", () => {
    expect(describeLastUsed(new Date("2026-09-07T05:00:00Z"), noonUtc)).toBe("Käytetty tänään");
  });

  it("says yesterday for the previous date, not for 24 hours ago", () => {
    // 23:50 the night before is "eilen" at 00:10, even though barely 20 minutes
    // have passed. Calendar days are what a reader means.
    expect(
      describeLastUsed(new Date("2026-09-06T20:50:00Z"), new Date("2026-09-06T21:10:00Z"))
    ).toBe("Käytetty eilen");
  });

  it("gives a Finnish date further back", () => {
    expect(describeLastUsed(new Date("2026-09-03T06:00:00Z"), noonUtc)).toBe("Käytetty 3.9.2026");
  });

  it("treats a clock-skewed future timestamp as today rather than negative days", () => {
    expect(describeLastUsed(new Date("2026-09-08T06:00:00Z"), noonUtc)).toBe("Käytetty tänään");
  });

  it.each([
    // 00:30 Helsinki on the 7th is 21:30 UTC on the 6th, and noon Helsinki the
    // same day is 09:00 UTC on the 7th. In Helsinki that is one date; in UTC —
    // which is what Railway runs — it straddles two, so a server computing in
    // its own timezone reports "eilen" to a reader for whom it is plainly today.
    ["a small-hours session later the same day", "2026-09-06T21:30:00Z", "2026-09-07T09:00:00Z"],
    // And the mirror: 23:30 and 23:45 Helsinki on the 6th are 20:30 and 20:45
    // UTC the same day — one evening, one date, in both timezones.
    ["late evening in Helsinki", "2026-09-06T20:30:00Z", "2026-09-06T20:45:00Z"],
  ])("computes %s in Helsinki, not the server's timezone", (_case, used, now) => {
    expect(describeLastUsed(new Date(used), new Date(now))).toBe("Käytetty tänään");
  });

  it("formats the date in Helsinki too, not only compares it", () => {
    // 22:00 UTC on 2 September is already 3 September in Helsinki.
    expect(
      describeLastUsed(new Date("2026-09-02T22:00:00Z"), new Date("2026-09-10T09:00:00Z"))
    ).toBe("Käytetty 3.9.2026");
  });
});
