/**
 * Turning a user-agent string into something a reader recognises, for the
 * device list in specs/024-account-settings.md.
 *
 * Deliberately crude, and a local mapping rather than a dependency. This exists
 * so someone can tell "my laptop" from "not my laptop" when deciding whether to
 * sign other devices out. It is not analytics: a wrong guess costs nothing,
 * while a parsing library would be a supply-chain dependency bought for one
 * line of a settings page.
 *
 * **The operating system is deliberately not shown.** An earlier version
 * rendered `Chrome · macOS`, which put two English product names in a Finnish
 * UI to say what one already says. Confirmed with Miikka: the browser alone
 * identifies a device well enough, and the cost — two Chrome sessions on
 * different machines reading alike — is accepted.
 *
 * The remaining label is a Finnish compound around the product name —
 * `Chrome-selain`, not a bare `Chrome`. The brand cannot be translated, but the
 * word around it can be, and this matches the `Tuntematon selain` the fallback
 * has always used. A bare brand next to that fallback was the inconsistency.
 */

const UNKNOWN_BROWSER = "Tuntematon selain";

/**
 * Order matters and is the whole trick. Every one of these strings contains the
 * ones below it: Edge's UA says `Chrome` and `Safari`, Chrome's says `Safari`.
 * Matching in this order is what stops every browser reporting as Safari.
 */
const BROWSERS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ["Edg/", "Edge-selain"],
  ["OPR/", "Opera-selain"],
  ["Firefox/", "Firefox-selain"],
  ["Chrome/", "Chrome-selain"],
  ["Safari/", "Safari-selain"],
];

/**
 * The browser behind a session, or `Tuntematon selain`.
 *
 * Never the raw user-agent string: the row exists to be recognised at a glance,
 * and 200 characters of `Mozilla/5.0 (…)` is not that. Null and empty are the
 * same answer, since `user_agent` is nullable — behind some proxies the header
 * never arrives at all.
 */
export function describeDevice(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === "") return UNKNOWN_BROWSER;

  for (const [needle, label] of BROWSERS) {
    if (userAgent.includes(needle)) return label;
  }
  return UNKNOWN_BROWSER;
}

const lastUsedFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/**
 * The calendar date in Helsinki, as `2026-09-03`, for comparing days.
 *
 * `en-CA` is a deliberate trick, not a stray locale: it yields ISO-ordered
 * `YYYY-MM-DD`, which sorts and compares as a string. The reader never sees it.
 */
const helsinkiDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `Käytetty tänään` / `Käytetty eilen` / `Käytetty 3.9.2026`.
 *
 * Everything here is computed in **Europe/Helsinki**, like every other
 * user-facing date in the app (`match-list-table.tsx`, `match-detail.ts`,
 * `national-team.ts`). This runs on the server, so the alternative was not "the
 * reader's timezone" but *Railway's* — UTC — which for a Finnish reader gets
 * `tänään` and `eilen` wrong for the two or three hours after midnight.
 *
 * Compared on calendar days rather than elapsed hours: "yesterday" means the
 * previous date, not 24 hours ago, so a session used at 23:50 does not still
 * read `tänään` at 00:10.
 */
export function describeLastUsed(updatedAt: Date, now: Date = new Date()): string {
  const day = (date: Date) => Date.parse(`${helsinkiDateKeyFormatter.format(date)}T00:00:00Z`);

  const days = Math.round((day(now) - day(updatedAt)) / 86_400_000);

  if (days <= 0) return "Käytetty tänään";
  if (days === 1) return "Käytetty eilen";
  return `Käytetty ${lastUsedFormatter.format(updatedAt)}`;
}
