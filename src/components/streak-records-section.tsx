import { ChartPanel } from "@/components/charts/chart-panel";
import {
  LONGEST_DEFEATS_LABEL,
  LONGEST_UNBEATEN_LABEL,
  LONGEST_WINLESS_LABEL,
  LONGEST_WINS_LABEL,
} from "@/components/streaks-section";
import { hasAnyRecord, type StreakRecord, type StreakRecordsSeries } from "@/lib/streak-records";

/** The strings agreed in specs/039, each where the spec places it. */
export const RECORDS_HEADING = "Ennätykset";
export const NO_RECORDS_MESSAGE = "Ei vielä ennätyksiä.";
export const RECORDS_ERROR_MESSAGE = "Ennätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "streak-records";

/** `1 voitto` / `3 voittoa`: Finnish counts one thing differently, as `Putket` does. */
function count(length: number, one: string, many: string): string {
  return `${length} ${length === 1 ? one : many}`;
}

/**
 * When a record was set: `Kausi 2024`, or `Kaudet 2024–2025` for one that
 * crossed a season boundary.
 *
 * Named by season and never by match number (specs/039, S8) — match 37 of a run
 * spanning two seasons is not something a reader can find. `Putket` keeps
 * `Ottelut 5–9` for the season it shows: the two panels answer different
 * questions, so a different unit for "when" is honest rather than inconsistent.
 */
export function seasonSpanText(record: StreakRecord): string {
  return record.from === record.to ? `Kausi ${record.from}` : `Kaudet ${record.from}–${record.to}`;
}

/**
 * The records panel in `Analyysit` (specs/039): four figures, not a chart. A
 * record is one number, and four numbers do not need an axis. `null` means no
 * panel: this club has no stored league season at all.
 */
export function streakRecordsPanel(series: StreakRecordsSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={RECORDS_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<StreakRecordsSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{RECORDS_ERROR_MESSAGE}</p>;
  if (!hasAnyRecord(series.records)) return <p>{NO_RECORDS_MESSAGE}</p>;

  const figures = [
    [LONGEST_WINS_LABEL, series.records.wins, "voitto", "voittoa"],
    [
      LONGEST_UNBEATEN_LABEL,
      series.records.unbeaten,
      "ottelu ilman tappiota",
      "ottelua ilman tappiota",
    ],
    [LONGEST_DEFEATS_LABEL, series.records.defeats, "tappio", "tappiota"],
    [
      LONGEST_WINLESS_LABEL,
      series.records.winless,
      "ottelu ilman voittoa",
      "ottelua ilman voittoa",
    ],
  ] as const;

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {figures.map(([label, record, one, many]) => (
        <div key={label}>
          <dt className="text-muted text-sm">{label}</dt>
          <dd>
            {record === null ? (
              NO_RECORDS_MESSAGE
            ) : (
              <>
                {count(record.length, one, many)}{" "}
                <span className="text-muted text-sm">{seasonSpanText(record)}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
