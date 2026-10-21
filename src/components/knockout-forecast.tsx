import Link from "next/link";
import { formatDecimal } from "@/components/charts/line-chart";
import { QUALITY_LINK } from "@/components/match-prediction";
import {
  type ChanceColumn,
  ChanceTable,
  chanceText,
  EXPECTED_POINTS_HEADER,
  FORECAST_ERROR_MESSAGE,
  FORECAST_TEAM_HEADER,
  NO_FIXTURES_MESSAGE,
  POINTS_WIDTH,
  TITLE_HEADER,
  WIDE_CHANCE_WIDTH,
} from "@/components/season-forecast";
import { getStageName } from "@/lib/cup-stages";
import {
  type KnockoutRow,
  LEAGUE_PHASE_ZONES,
  REACHED_STAGES,
  type TieChance,
} from "@/lib/knockout-simulation";
import type { KnockoutForecast } from "@/lib/knockout-simulation-service";
import type { Chance, ForecastRow } from "@/lib/season-simulation";

/**
 * The panel's own strings; its heading, failure and no-fixtures lines are the
 * season forecast's.
 *
 * decisions/067-knockout-simulation.md
 */
export const TIES_HEADING = "Kierroksen parit";
export const KNOCKOUT_NOTE =
  "Loppukausi on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Arpomattomat parit on arvottu sääntöjen mukaan, ja tasaiset ottelut on ratkaistu jatkoajalla ja rangaistuspotkuilla.";

/**
 * `Real Madrid – Benfica: jatkoon 71 % – 29 %`: a tie's two chances of going
 * through, rounded as every chance is.
 *
 * decisions/067-knockout-simulation.md
 */
export function tieText(tie: TieChance): string {
  const home: Chance = { share: tie.homeThrough, settled: false };
  const away: Chance = { share: 1 - tie.homeThrough, settled: false };
  return `${tie.home.teamName} – ${tie.away.teamName}: jatkoon ${chanceText(home)} – ${chanceText(away)}`;
}

const LEAGUE_PHASE_COLUMNS: ChanceColumn<ForecastRow>[] = [
  { key: "team", header: FORECAST_TEAM_HEADER, text: (row) => row.teamName },
  {
    key: "points",
    header: EXPECTED_POINTS_HEADER,
    width: POINTS_WIDTH,
    text: (row) => formatDecimal(row.expectedPoints),
  },
  ...LEAGUE_PHASE_ZONES.map((zone, index) => ({
    key: `zone-${zone.from}`,
    header: zone.label,
    width: WIDE_CHANCE_WIDTH,
    text: (row: ForecastRow) => chanceText(row.zones[index] as Chance),
  })),
];

const KNOCKOUT_COLUMNS: ChanceColumn<KnockoutRow>[] = [
  { key: "team", header: FORECAST_TEAM_HEADER, text: (row) => row.teamName },
  ...REACHED_STAGES.map((stage, index) => ({
    key: stage,
    header: getStageName(stage),
    width: WIDE_CHANCE_WIDTH,
    text: (row: KnockoutRow) => chanceText(row.reached[index] as Chance),
  })),
  {
    key: "won",
    header: TITLE_HEADER,
    width: WIDE_CHANCE_WIDTH,
    text: (row) => chanceText(row.won),
  },
];

/**
 * The Champions League's forecast: the league phase while it has a fixture
 * left, the ties still to be decided, every side's chance of each knockout round
 * and of winning, what the figures are and the model's record.
 *
 * decisions/067-knockout-simulation.md
 */
export function KnockoutForecastBody({
  forecast,
  qualityHref,
}: Readonly<{
  forecast: Exclude<KnockoutForecast, { status: "unavailable" }>;
  qualityHref: string;
}>) {
  if (forecast.status === "error") return <p>{FORECAST_ERROR_MESSAGE}</p>;
  if (forecast.status === "no-fixtures") return <p>{NO_FIXTURES_MESSAGE}</p>;

  return (
    <div>
      {forecast.leaguePhase === null ? null : (
        <ChanceTable columns={LEAGUE_PHASE_COLUMNS} rows={forecast.leaguePhase} />
      )}
      {forecast.ties.length === 0 ? null : (
        <div className="mt-2">
          <h5 className="mb-1 font-medium text-sm">{TIES_HEADING}</h5>
          <ul className="space-y-1 text-sm">
            {forecast.ties.map((tie) => (
              <li key={tie.key}>{tieText(tie)}</li>
            ))}
          </ul>
        </div>
      )}
      <ChanceTable columns={KNOCKOUT_COLUMNS} rows={forecast.rows} />
      <p className="mt-2 text-muted text-sm">{KNOCKOUT_NOTE}</p>
      <p className="mt-2 text-sm">
        <Link className="hover:underline" href={qualityHref}>
          {QUALITY_LINK}
        </Link>
      </p>
    </div>
  );
}
