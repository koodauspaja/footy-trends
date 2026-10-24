import { TableFold } from "@/components/heading-folds";
import { TIES_HEADING, TieLines } from "@/components/knockout-forecast";
import {
  type ChanceColumn,
  ChanceTable,
  chanceText,
  FORECAST_ERROR_MESSAGE,
  NO_FIXTURES_MESSAGE,
} from "@/components/season-forecast";
import type { KnockoutRow, TieChance } from "@/lib/knockout-simulation";
import type { CupForecastResult } from "@/lib/knockout-simulation-service";
import type { Chance } from "@/lib/season-simulation";
import type { FoldState } from "@/lib/section-keys";
/**
 * The section's strings; its failure and no-fixtures lines are the season
 * forecast's.
 *
 * decisions/067-knockout-simulation.md
 */
export const CUP_FORECAST_HEADING = "Cupin ennuste";
export const CUP_WIN_HEADER = "Cupin voitto";
export const BEFORE_LAST_SIXTEEN_LINE =
  "Cupin voittajaa ennustetaan neljännesvälieristä alkaen, kun kaikki joukkueet ovat mukana.";
export const CUP_NOTE =
  "Loppukilpailu on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Seuraavien kierrosten parit on arvottu, ja tasapelit on ratkaistu jatkoajalla ja rangaistuspotkuilla.";

/**
 * A round by how many sides it holds, as specs/015 names a cup's rounds: the
 * forecast starts at the round of 16 or later, so every round has a name.
 *
 * decisions/067-knockout-simulation.md
 */
const ROUND_NAMES: Readonly<Record<number, string>> = {
  16: "Neljännesvälierät",
  8: "Puolivälierät",
  4: "Välierät",
  2: "Loppuottelu",
};

/**
 * The division an unrated side counts as, in the form the line needs (S10).
 *
 * decisions/067-knockout-simulation.md
 */
const STAND_IN_NAMES: Readonly<Record<string, string>> = {
  M2: "Kakkosen",
  N1: "Kansallisen Ykkösen",
};

/**
 * The line saying which division's average side an unrated side counts as.
 *
 * decisions/067-knockout-simulation.md
 */
export function standInLine(division: string): string {
  return `Joukkueet, joiden sarjaotteluita ei ole tilastoitu, on laskettu ${STAND_IN_NAMES[division]} keskitasoisiksi.`;
}

/**
 * A round's column and the cup's own: wide enough for `Neljännesvälierät`.
 *
 * decisions/067-knockout-simulation.md
 */
const ROUND_WIDTH = 136;

function columnsFor(roundSizes: readonly number[]): ChanceColumn<KnockoutRow>[] {
  return [
    ...roundSizes.map((size, index) => ({
      key: `round-${size}`,
      header: ROUND_NAMES[size] as string,
      width: ROUND_WIDTH,
      text: (row: KnockoutRow) => chanceText(row.reached[index] as Chance),
    })),
    { key: "won", header: CUP_WIN_HEADER, width: ROUND_WIDTH, text: (row) => chanceText(row.won) },
  ];
}

function Ties({ ties }: Readonly<{ ties: readonly TieChance[] }>) {
  if (ties.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-1 font-medium">{TIES_HEADING}</h3>
      <TieLines ties={ties} />
    </div>
  );
}

/**
 * A Suomen Cup's forecast after `Pudotuspelit` (S11): from its round of 16 every
 * side's chances, then the rated ties; before it, the rated ties and the line.
 *
 * decisions/067-knockout-simulation.md
 * decisions/071-section-toggles.md
 */
export function CupForecastSection({
  forecast,
  fold,
}: Readonly<{
  forecast: Exclude<CupForecastResult, { status: "unavailable" }>;
  fold: FoldState;
}>) {
  return (
    <TableFold fold={fold} heading={CUP_FORECAST_HEADING} headingId="cup-forecast">
      <CupForecastBody forecast={forecast} />
    </TableFold>
  );
}

function CupForecastBody({
  forecast,
}: Readonly<{ forecast: Exclude<CupForecastResult, { status: "unavailable" }> }>) {
  if (forecast.status === "error") return <p>{FORECAST_ERROR_MESSAGE}</p>;
  if (forecast.status === "no-fixtures") return <p>{NO_FIXTURES_MESSAGE}</p>;
  if (forecast.status === "before") {
    return (
      <div>
        <Ties ties={forecast.ties} />
        <p className="mt-2 text-muted text-sm">{BEFORE_LAST_SIXTEEN_LINE}</p>
      </div>
    );
  }

  return (
    <div>
      <ChanceTable columns={columnsFor(forecast.roundSizes)} rows={forecast.rows} />
      <Ties ties={forecast.ties} />
      <p className="mt-2 text-muted text-sm">{CUP_NOTE}</p>
      {forecast.standIn === null ? null : (
        <p className="mt-2 text-muted text-sm">{standInLine(forecast.standIn)}</p>
      )}
    </div>
  );
}
