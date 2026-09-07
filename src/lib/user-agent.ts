/**
 * Turning a user-agent string into something a reader recognises, for the
 * device list in specs/024-account-settings.md.
 *
 * Deliberately crude, and a local mapping rather than a dependency. This exists
 * so someone can tell "my laptop" from "not my laptop" when deciding whether to
 * sign other devices out. It is not analytics: a wrong guess costs nothing,
 * while a parsing library would be a supply-chain dependency bought for one
 * line of a settings page.
 */

const UNKNOWN_BROWSER = "Tuntematon selain";

/**
 * Order matters and is the whole trick. Every one of these strings contains the
 * ones below it: Edge's UA says `Chrome` and `Safari`, Chrome's says `Safari`.
 * Matching in this order is what stops every browser reporting as Safari.
 */
const BROWSERS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
];

/**
 * Also order-dependent: an iPhone's UA contains `Mac OS X`, and an Android's
 * contains `Linux`. The specific platform has to be tested before the general
 * one it is built on.
 */
const SYSTEMS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ["iPhone", "iOS"],
  ["iPad", "iPadOS"],
  ["Android", "Android"],
  ["Windows", "Windows"],
  ["Mac OS X", "macOS"],
  ["Linux", "Linux"],
];

function firstMatch(value: string, table: ReadonlyArray<readonly [string, string]>): string | null {
  for (const [needle, label] of table) {
    if (value.includes(needle)) return label;
  }
  return null;
}

/**
 * `Chrome · macOS`, or just the browser where the system is unrecognised.
 *
 * Falls back to `Tuntematon selain` rather than showing a raw user-agent
 * string: the row exists to be recognised at a glance, and 200 characters of
 * `Mozilla/5.0 (…)` is not that. Null and empty are treated the same, since
 * `user_agent` is nullable — a request behind some proxies carries no such
 * header at all.
 */
export function describeDevice(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === "") return UNKNOWN_BROWSER;

  const browser = firstMatch(userAgent, BROWSERS);
  if (browser === null) return UNKNOWN_BROWSER;

  const system = firstMatch(userAgent, SYSTEMS);
  return system === null ? browser : `${browser} · ${system}`;
}

/**
 * `Käytetty tänään` / `Käytetty eilen` / `Käytetty 3.9.2026`.
 *
 * Compared on calendar days in the reader's own timezone rather than on elapsed
 * hours: "yesterday" means the previous date, not 24 hours ago, and a session
 * used at 23:50 should not still read `tänään` at 00:10.
 */
export function describeLastUsed(updatedAt: Date, now: Date = new Date()): string {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const days = Math.round((startOfDay(now) - startOfDay(updatedAt)) / 86_400_000);

  if (days <= 0) return "Käytetty tänään";
  if (days === 1) return "Käytetty eilen";
  return `Käytetty ${updatedAt.toLocaleDateString("fi-FI")}`;
}
