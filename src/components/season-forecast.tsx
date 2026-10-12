import Link from "next/link";
import { formatDecimal, percentText } from "@/components/charts/line-chart";
import { QUALITY_LINK } from "@/components/match-prediction";
import type {
  Chance,
  ForecastLayout,
  ForecastRow,
  ForecastTable,
  SeasonForecast,
} from "@/lib/season-simulation";

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
 * One column: its heading, what a row prints in it, and its width in pixels.
 * The team's column has none and takes what is left.
 *
 * decisions/061-season-simulation.md
 */
type ForecastColumn = {
  key: string;
  header: string;
  width?: number;
  text: (row: ForecastRow) => string;
};

/**
 * Column widths, and the least the team's name may have before the table
 * scrolls sideways. First and last place fit a phone; the five columns of a
 * single table do not, and scroll there.
 *
 * decisions/061-season-simulation.md
 */
const POINTS_WIDTH = 72;
const CHANCE_WIDTH = 76;
const WIDE_CHANCE_WIDTH = 96;
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
 * A table's columns: the title, top three and bottom three for a season with
 * one table; first and last place for one of several; first place only before
 * a split.
 *
 * decisions/061-season-simulation.md
 */
function columnsFor(layout: ForecastLayout, decidesTitle: boolean): ForecastColumn[] {
  const shared: ForecastColumn[] = [
    { key: "team", header: FORECAST_TEAM_HEADER, text: (row) => row.teamName },
    {
      key: "points",
      header: EXPECTED_POINTS_HEADER,
      width: POINTS_WIDTH,
      text: (row) => formatDecimal(row.expectedPoints),
    },
  ];
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
 * One table's forecast, under the group's name when it has one. Fixed column
 * widths, so the tables of a season line up; narrower than `DataTable`'s,
 * whose 240px name column would push the chances off a phone's screen.
 *
 * decisions/061-season-simulation.md
 */
function ForecastTableView({
  table,
  layout,
}: Readonly<{ table: ForecastTable; layout: ForecastLayout }>) {
  const columns = columnsFor(layout, table.decidesTitle);
  const [team, ...figures] = columns as [ForecastColumn, ...ForecastColumn[]];
  const minWidth = figures.reduce(
    (total, column) => total + (column.width as number),
    TEAM_MINIMUM
  );
  return (
    <div className="mt-2">
      {table.groupName === null ? null : (
        <h5 className="mb-1 font-medium text-sm">{table.groupName}</h5>
      )}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm" style={{ minWidth: `${minWidth}px` }}>
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.key}
                style={column.width === undefined ? undefined : { width: `${column.width}px` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-border border-b text-muted">
              <th className="py-2 pr-2 text-left align-bottom font-medium" scope="col">
                {team.header}
              </th>
              {figures.map((column) => (
                <th
                  className="py-2 pl-2 text-right align-bottom font-medium"
                  key={column.key}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr className="border-border-subtle border-b" key={row.teamProviderId}>
                <th className="py-2 pr-2 text-left font-semibold" scope="row">
                  {team.text(row)}
                </th>
                {figures.map((column) => (
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
 * The season forecast: a table per simulated table of the season, what the
 * figures are, and a link to the model's record in the competition, or the
 * line saying why there is no forecast.
 *
 * decisions/061-season-simulation.md
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
        <ForecastTableView
          key={table.groupName}
          layout={forecast.layout}
          table={named ? table : { ...table, groupName: null }}
        />
      ))}
      <p className="mt-2 text-muted text-sm">{FORECAST_NOTE}</p>
      {forecast.layout === "before-split" ? (
        <p className="mt-2 text-muted text-sm">{BEFORE_SPLIT_NOTE}</p>
      ) : null}
      <p className="mt-2 text-sm">
        <Link className="hover:underline" href={qualityHref}>
          {QUALITY_LINK}
        </Link>
      </p>
    </div>
  );
}
