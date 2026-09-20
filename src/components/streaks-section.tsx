import { ChartPanel } from "@/components/charts/chart-panel";
import type { CurrentStreak, Streak, StreaksSeries } from "@/lib/streaks";

/** The strings agreed in specs/035, each where the spec places it. */
export const STREAKS_HEADING = "Putket";
export const CURRENT_LABEL = "Tämänhetkinen putki";
export const LONGEST_WINS_LABEL = "Pisin voittoputki";
export const LONGEST_UNBEATEN_LABEL = "Pisin tappioton putki";
export const LONGEST_DEFEATS_LABEL = "Pisin tappioputki";
export const LONGEST_WINLESS_LABEL = "Pisin voitoton putki";
export const NO_STREAK_MESSAGE = "Ei vielä putkea.";
export const STREAKS_ERROR_MESSAGE = "Putkia ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "streaks";

/** `1 voitto` / `3 voittoa`, and so on: Finnish counts one thing differently. */
function count(length: number, one: string, many: string): string {
  return `${length} ${length === 1 ? one : many}`;
}

/** What the run the team is on now is made of. */
export function currentText(current: CurrentStreak): string {
  if (current.outcome === "win") return count(current.length, "voitto", "voittoa");
  if (current.outcome === "defeat") return count(current.length, "tappio", "tappiota");
  return count(current.length, "tasapeli", "tasapeliä");
}

/** The matches a longest run spans: `Ottelut 5–9`, or `Ottelu 5` for one. */
export function spanText(streak: Streak): string {
  return streak.from === streak.to
    ? `Ottelu ${streak.from}`
    : `Ottelut ${streak.from}–${streak.to}`;
}

/**
 * The streaks panel in `Analyysit` (specs/035): five figures, not a chart. A
 * streak is one number, and five numbers do not need an axis. `null` means no
 * panel: no league table for this team's season.
 */
export function streaksPanel(series: StreaksSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={STREAKS_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<StreaksSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{STREAKS_ERROR_MESSAGE}</p>;

  const longest = [
    [LONGEST_WINS_LABEL, series.longest.wins, "voitto", "voittoa"],
    [
      LONGEST_UNBEATEN_LABEL,
      series.longest.unbeaten,
      "ottelu ilman tappiota",
      "ottelua ilman tappiota",
    ],
    [LONGEST_DEFEATS_LABEL, series.longest.defeats, "tappio", "tappiota"],
    [
      LONGEST_WINLESS_LABEL,
      series.longest.winless,
      "ottelu ilman voittoa",
      "ottelua ilman voittoa",
    ],
  ] as const;

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <Figure label={CURRENT_LABEL}>
        {series.current === null ? NO_STREAK_MESSAGE : currentText(series.current)}
      </Figure>
      {longest.map(([label, streak, one, many]) => (
        <Figure key={label} label={label}>
          {streak === null ? (
            NO_STREAK_MESSAGE
          ) : (
            <>
              {count(streak.length, one, many)}{" "}
              <span className="text-muted text-sm">{spanText(streak)}</span>
            </>
          )}
        </Figure>
      ))}
    </dl>
  );
}

/** One figure: its name, and what it is. */
function Figure({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-muted text-sm">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
