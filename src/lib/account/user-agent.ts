/**
 * Turning a user-agent string into something a reader recognises, for the
 * settings page's device list. Crude on purpose: a local mapping, and the
 * browser only, never the operating system.
 *
 * decisions/024-account-settings.md
 */

const UNKNOWN_BROWSER = "Tuntematon selain";

/**
 * Order matters: every one of these strings contains the ones below it.
 * Edge's UA says `Chrome` and `Safari`, Chrome's says `Safari`.
 *
 * decisions/024-account-settings.md
 */
const BROWSERS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ["Edg/", "Edge-selain"],
  ["OPR/", "Opera-selain"],
  ["Firefox/", "Firefox-selain"],
  ["Chrome/", "Chrome-selain"],
  ["Safari/", "Safari-selain"],
];

/**
 * The browser behind a session, or `Tuntematon selain`. Never the raw
 * user-agent string; null and empty are the same answer.
 *
 * decisions/024-account-settings.md
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
 * The calendar date in Helsinki, as `2026-09-03`, for comparing days. `en-CA`
 * yields ISO-ordered `YYYY-MM-DD`; the reader never sees it.
 *
 * decisions/024-account-settings.md
 */
const helsinkiDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `Käytetty tänään`, `Käytetty eilen` or `Käytetty 3.9.2026`, compared on
 * calendar days in Europe/Helsinki.
 *
 * decisions/024-account-settings.md
 */
export function describeLastUsed(updatedAt: Date, now: Date = new Date()): string {
  const day = (date: Date) => Date.parse(`${helsinkiDateKeyFormatter.format(date)}T00:00:00Z`);

  const days = Math.round((day(now) - day(updatedAt)) / 86_400_000);

  if (days <= 0) return "Käytetty tänään";
  if (days === 1) return "Käytetty eilen";
  return `Käytetty ${lastUsedFormatter.format(updatedAt)}`;
}
