import Link from "next/link";
import { formatDecimal, percentText } from "@/components/charts/line-chart";
import { QUALITY_LINK } from "@/components/match-prediction";
import type { Zone } from "@/lib/competition-zones";
import type { Chance, ForecastLayout, ForecastRow, SeasonForecast } from "@/lib/season-simulation";

/**
 * The panel's strings.
 *
 * decisions/061-season-simulation.md
 */
export const FORECAST_HEADING = "Kauden ennuste";
export const FORECAST_TEAM_HEADER = "Joukkue";
export const EXPECTED_POINTS_HEADER = "Odotetut pisteet";
export const TITLE_HEADER = "Mestaruus";
export const TOP_THREE_HEADER = "Kolmen parhaan joukossa";
export const BOTTOM_THREE_HEADER = "Kolmen huonoimman joukossa";
export const TABLE_WIN_HEADER = "Sarjan voitto";
export const TABLE_LAST_HEADER = "Sarjan viimeinen sija";
export const REGULAR_SEASON_WIN_HEADER = "Runkosarjan voitto";
export const FORECAST_NOTE =
  "Jäljellä olevat ottelut on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Tasapisteissä ratkaisee nykyinen järjestys.";
export const BEFORE_SPLIT_NOTE =
  "Ennuste ulottuu runkosarjan loppuun; jatkosarjojen ottelut eivät ole vielä tiedossa.";
export const FORECAST_ERROR_MESSAGE =
  "Kauden ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_FIXTURES_MESSAGE = "Kaudella ei ole enää pelaamattomia otteluita.";
export const NOT_SIMULATED_MESSAGE =
  "Kauden ennustetta ei lasketa, koska sarjataulukko näytetään Palloliiton tiedoista sellaisenaan.";

/**
 * The line naming the tables a forecast leaves out, joined as Finnish joins a
 * list. Only ever given one or more.
 *
 * decisions/638-forecast-names-left-out-groups.md
 */
export function leftOutText(names: readonly string[]): string {
  if (names.length === 1) {
    return `${names[0]} ei ole mukana, koska sen sarjataulukko näytetään Palloliiton tiedoista sellaisenaan.`;
  }
  const listed = `${names.slice(0, -1).join(", ")} ja ${names.at(-1)}`;
  return `${listed} eivät ole mukana, koska niiden sarjataulukot näytetään Palloliiton tiedoista sellaisenaan.`;
}

/**
 * A chance as printed: a whole percent, `< 1 %` below one and `> 99 %` from
 * 99,5 up, with `0 %` and `100 %` kept for a place the table has settled.
 *
 * decisions/061-season-simulation.md
 */
export function chanceText(chance: Chance): string {
  if (chance.settled) return percentText(chance.share * 100);
  if (chance.share < 0.01) return "< 1 %";
  if (chance.share >= 0.995) return "> 99 %";
  return percentText(chance.share * 100);
}

/**
 * One column of figures: its heading, what a row prints in it, and its width in
 * pixels; the team's own column takes what is left. A zone's column has a
 * `subheader` too, the places it covers, under its label.
 *
 * decisions/061-season-simulation.md
 * decisions/064-season-simulation-zones.md
 * decisions/067-knockout-simulation.md
 */
export type ChanceColumn<Row> = {
  key: string;
  header: string;
  subheader?: string;
  width: number;
  text: (row: Row) => string;
};

type ForecastColumn = ChanceColumn<ForecastRow>;

/**
 * Column widths, and the least the team's name may have before the table
 * scrolls sideways. First and last place fit a phone; the five columns of a
 * single table do not, and scroll there.
 *
 * decisions/061-season-simulation.md
 */
export const POINTS_WIDTH = 72;
const CHANCE_WIDTH = 76;
export const WIDE_CHANCE_WIDTH = 96;
const ZONE_WIDTH = 112;
const TEAM_MINIMUM = 112;

function chanceColumn(
  key: string,
  header: string,
  width: number,
  chance: (row: ForecastRow) => Chance
): ForecastColumn {
  return { key, header, width, text: (row) => chanceText(chance(row)) };
}

/**
 * The places a zone covers, as its column's second line: `sija 1`, `sijat 3–8`.
 *
 * decisions/064-season-simulation-zones.md
 */
export function zonePositionsText(zone: Zone): string {
  return zone.from === zone.to ? `sija ${zone.from}` : `sijat ${zone.from}–${zone.to}`;
}

/**
 * A table's columns: one per labelled zone when the group has any; else the
 * title, top three and bottom three for a season with one table; first and
 * last place for one of several; first place only before a split.
 *
 * decisions/061-season-simulation.md
 * decisions/064-season-simulation-zones.md
 */
function columnsFor(
  layout: ForecastLayout,
  decidesTitle: boolean,
  zones: readonly Zone[]
): ForecastColumn[] {
  const shared: ForecastColumn[] = [
    {
      key: "points",
      header: EXPECTED_POINTS_HEADER,
      width: POINTS_WIDTH,
      text: (row) => formatDecimal(row.expectedPoints),
    },
  ];
  if (zones.length > 0) {
    return [
      ...shared,
      ...zones.map((zone, index) => ({
        key: `zone-${zone.from}-${zone.to}-${index}`,
        header: zone.label,
        subheader: zonePositionsText(zone),
        width: ZONE_WIDTH,
        text: (row: ForecastRow) => chanceText(row.zones[index] as Chance),
      })),
    ];
  }
  if (layout === "before-split") {
    return [
      ...shared,
      chanceColumn("first", REGULAR_SEASON_WIN_HEADER, WIDE_CHANCE_WIDTH, (row) => row.first),
    ];
  }

  const firstHeader = decidesTitle ? TITLE_HEADER : TABLE_WIN_HEADER;
  return layout === "single"
    ? [
        ...shared,
        chanceColumn("first", firstHeader, WIDE_CHANCE_WIDTH, (row) => row.first),
        chanceColumn("top-three", TOP_THREE_HEADER, WIDE_CHANCE_WIDTH, (row) => row.topThree),
        chanceColumn(
          "bottom-three",
          BOTTOM_THREE_HEADER,
          WIDE_CHANCE_WIDTH,
          (row) => row.bottomThree
        ),
      ]
    : [
        ...shared,
        chanceColumn("first", firstHeader, CHANCE_WIDTH, (row) => row.first),
        chanceColumn("last", TABLE_LAST_HEADER, CHANCE_WIDTH, (row) => row.last),
      ];
}

/**
 * A table of chances, the first column a team's name. Fixed column widths, so the
 * tables of a season line up; narrower than `DataTable`'s, whose 240px name column
 * would push the chances off a phone. The name stays in view when the table scrolls.
 *
 * decisions/061-season-simulation.md
 * decisions/064-season-simulation-zones.md
 * decisions/067-knockout-simulation.md
 */
export function ChanceTable<Row extends { teamProviderId: number; teamName: string }>({
  columns,
  rows,
  heading = null,
}: Readonly<{
  columns: readonly ChanceColumn<Row>[];
  rows: readonly Row[];
  heading?: string | null;
}>) {
  const minWidth = columns.reduce((total, column) => total + column.width, TEAM_MINIMUM);
  return (
    <div className="mt-2">
      {heading === null ? null : <h5 className="mb-1 font-medium text-sm">{heading}</h5>}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm" style={{ minWidth: `${minWidth}px` }}>
          <colgroup>
            <col />
            {columns.map((column) => (
              <col key={column.key} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-border border-b text-muted">
              <th
                className="sticky left-0 bg-background py-2 pr-2 text-left align-bottom font-medium"
                scope="col"
              >
                {FORECAST_TEAM_HEADER}
              </th>
              {columns.map((column) => (
                <th
                  className="py-2 pl-2 text-right align-bottom font-medium"
                  key={column.key}
                  scope="col"
                >
                  {column.header}
                  {column.subheader === undefined ? null : (
                    <span className="block font-normal text-xs">{column.subheader}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-border-subtle border-b" key={row.teamProviderId}>
                <th
                  className="sticky left-0 bg-background py-2 pr-2 text-left font-semibold"
                  scope="row"
                >
                  {row.teamName}
                </th>
                {columns.map((column) => (
                  <td className="py-2 pl-2 text-right tabular-nums" key={column.key}>
                    {column.text(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The season forecast: a table per simulated table of the season, the tables
 * left out, what the figures are, and a link to the model's record in the
 * competition, or the line saying why there is no forecast.
 *
 * decisions/061-season-simulation.md
 * decisions/638-forecast-names-left-out-groups.md
 * decisions/067-knockout-simulation.md
 */
export function SeasonForecastBody({
  forecast,
  qualityHref,
}: Readonly<{
  forecast: Exclude<SeasonForecast, { status: "unavailable" }>;
  qualityHref: string;
}>) {
  if (forecast.status === "error") return <p>{FORECAST_ERROR_MESSAGE}</p>;
  if (forecast.status === "no-fixtures") return <p>{NO_FIXTURES_MESSAGE}</p>;
  if (forecast.status === "not-simulated") return <p>{NOT_SIMULATED_MESSAGE}</p>;

  // One table of a season with one is the league's own: its name is the page's.
  const named = forecast.layout !== "single";
  return (
    <div>
      {forecast.tables.map((table) => (
        <ChanceTable
          columns={columnsFor(forecast.layout, table.decidesTitle, table.zones)}
          heading={named ? table.groupName : null}
          key={table.groupId}
          rows={table.rows}
        />
      ))}
      {forecast.leftOut.length === 0 ? null : (
        <p className="mt-2 text-muted text-sm">{leftOutText(forecast.leftOut)}</p>
      )}
      <p className="mt-2 text-muted text-sm">{FORECAST_NOTE}</p>
      {forecast.layout === "before-split" ? (
        <p className="mt-2 text-muted text-sm">{BEFORE_SPLIT_NOTE}</p>
      ) : null}
      <p className="mt-2 text-sm">
        <Link href={qualityHref}>{QUALITY_LINK}</Link>
      </p>
    </div>
  );
}
