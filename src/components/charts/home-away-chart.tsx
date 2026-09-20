import {
  concededPerMatch,
  pointsPerMatch,
  type SideStats,
  scoredPerMatch,
  winPercentage,
} from "@/lib/home-away";
import { matchCountLabel } from "@/lib/national-team";
import { BarChart, BarLegend, type BarRow } from "./bar-chart";
import { formatDecimal, percentText } from "./line-chart";

/** `2,11`: a season's per-match average, two decimals (specs/033, Q5). */
function perMatchText(value: number): string {
  return formatDecimal(value, 2);
}

/**
 * The four measures, each on its own fixed scale (specs/033, Q3): points 0–3,
 * the most possible; goals 0–4, which no stored top-tier side reached over a
 * season (3,12 at most); win % 0–100.
 */
export const MEASURES = [
  { label: "Pisteitä / ottelu", max: 3, value: pointsPerMatch, text: perMatchText },
  { label: "Tehdyt maalit / ottelu", max: 4, value: scoredPerMatch, text: perMatchText },
  { label: "Päästetyt maalit / ottelu", max: 4, value: concededPerMatch, text: perMatchText },
  { label: "Voittoprosentti", max: 100, value: winPercentage, text: percentText },
] as const;

/** A measure's printed value: `–` for a side with no match yet, never `0` (Q7). */
export function measureText(value: number | null, text: (value: number) => string): string {
  return value === null ? "–" : text(value);
}

/** One row of the text alternative, per measure (specs/033, Q4). */
export function homeAwaySentence(label: string, home: string, away: string): string {
  return `${label}: kotona ${home}, vieraissa ${away}.`;
}

/**
 * The team at home and away: a row per measure, a filled bar for home and an
 * outlined one for away, the values printed and listed as text.
 */
export function HomeAwayChart({
  title,
  headingId,
  home,
  away,
}: Readonly<{ title: string; headingId: string; home: SideStats; away: SideStats }>) {
  const textId = `${headingId}-text`;
  const measured = MEASURES.map((measure) => {
    const homeValue = measure.value(home);
    const awayValue = measure.value(away);
    const homeText = measureText(homeValue, measure.text);
    const awayText = measureText(awayValue, measure.text);
    const row: BarRow = {
      label: measure.label,
      max: measure.max,
      bars: [
        { name: "home", value: homeValue, text: homeText },
        { name: "away", value: awayValue, text: awayText, outlined: true },
      ],
    };
    return { row, sentence: homeAwaySentence(measure.label, homeText, awayText) };
  });

  return (
    <div>
      <BarChart
        describedBy={textId}
        labelledBy={headingId}
        rows={measured.map(({ row }) => row)}
        title={title}
      />
      <BarLegend
        items={[
          { label: `Kotona (${matchCountLabel(home.matches)})` },
          { label: `Vieraissa (${matchCountLabel(away.matches)})`, outlined: true },
        ]}
      />
      <ol className="sr-only" id={textId}>
        {measured.map(({ row, sentence }) => (
          <li key={row.label}>{sentence}</li>
        ))}
      </ol>
    </div>
  );
}
