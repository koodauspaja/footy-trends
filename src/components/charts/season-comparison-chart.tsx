import type { ComparisonRow, Measure } from "@/lib/season-comparison";
import { BarChart, BarLegend, type BarRow } from "./bar-chart";
import { formatDecimal, percentText } from "./line-chart";

/** `2,11`: a per-match average, two decimals, as `Koti- ja vierastilastot` prints them. */
function perMatchText(value: number): string {
  return formatDecimal(value, 2);
}

/**
 * How each measure is scaled and printed.
 *
 * The scales are `Koti- ja vierastilastot`'s (specs/033, Q3), so the same
 * measure is drawn the same length in both panels: points 0–3, goals 0–4,
 * a percentage 0–100.
 *
 * **A position is a share of its table, and is not inverted.** A short bar is a
 * high finish, which is how `Päästetyt maalit` already reads on this page —
 * inverting only this row would make one of the two rules wrong.
 */
const MEASURES: Record<Measure, { label: string; max: number }> = {
  position: { label: "Sijoitus", max: 1 },
  points: { label: "Pisteitä / ottelu", max: 3 },
  scored: { label: "Tehdyt maalit / ottelu", max: 4 },
  conceded: { label: "Päästetyt maalit / ottelu", max: 4 },
  cleanSheets: { label: "Nollapelit", max: 100 },
  winPercentage: { label: "Voittoprosentti", max: 100 },
};

/** The two columns, named once for the legend and the text alternative. */
export const SELECTED_LABEL = "Tämä kausi";
export const BASELINE_LABEL = "Tavallisesti";

/**
 * A measure's printed value: `–` for no value, never `0`, which would read as a
 * real zero (specs/033, Q7).
 *
 * A position is printed as the place it is, in the selected season's table —
 * `3.` for the season itself and `5,8.` for an average of other seasons, which
 * is a place no one finished in and is why it keeps its decimal. Without a
 * table to put it in, a share is not a place, so it prints as `–`.
 */
export function measureText(
  measure: Measure,
  value: number | null,
  teamCount: number | null,
  exact: boolean
): string {
  if (value === null) return "–";
  if (measure === "position") {
    if (teamCount === null) return "–";
    const place = value * teamCount;
    return exact ? `${Math.round(place)}.` : `${formatDecimal(place, 1)}.`;
  }
  return measure === "cleanSheets" || measure === "winPercentage"
    ? percentText(value)
    : perMatchText(value);
}

/**
 * One row of the text alternative, per measure.
 *
 * A position already ends in its ordinal period — `6,0.` — so the sentence does
 * not add a second one and read `6,0..`.
 */
export function comparisonSentence(label: string, selected: string, baseline: string): string {
  const stop = baseline.endsWith(".") ? "" : ".";
  return `${label}: ${SELECTED_LABEL.toLocaleLowerCase("fi")} ${selected}, ${BASELINE_LABEL.toLocaleLowerCase("fi")} ${baseline}${stop}`;
}

/**
 * The selected season beside what is usual for the club: a row per measure, a
 * filled bar for this season and an outlined one for the baseline, the values
 * printed and listed as text.
 */
export function SeasonComparisonChart({
  title,
  headingId,
  rows,
  teamCount,
}: Readonly<{
  title: string;
  headingId: string;
  rows: readonly ComparisonRow[];
  teamCount: number | null;
}>) {
  const textId = `${headingId}-text`;
  const measured = rows.map(({ measure, selected, baseline }) => {
    const { label, max } = MEASURES[measure];
    const selectedText = measureText(measure, selected, teamCount, true);
    const baselineText = measureText(measure, baseline, teamCount, false);
    const row: BarRow = {
      label,
      max,
      bars: [
        { name: "selected", value: selected ?? 0, text: selectedText },
        { name: "baseline", value: baseline ?? 0, text: baselineText, outlined: true },
      ],
    };
    return { row, sentence: comparisonSentence(label, selectedText, baselineText) };
  });

  return (
    <div>
      <BarChart
        describedBy={textId}
        labelledBy={headingId}
        rows={measured.map(({ row }) => row)}
        title={title}
      />
      <BarLegend items={[{ label: SELECTED_LABEL }, { label: BASELINE_LABEL, outlined: true }]} />
      <ol className="sr-only" id={textId}>
        {measured.map(({ row, sentence }) => (
          <li key={row.label}>{sentence}</li>
        ))}
      </ol>
    </div>
  );
}
