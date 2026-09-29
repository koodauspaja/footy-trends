import Link from "next/link";
import { ChartPanel } from "@/components/charts/chart-panel";
import { formatDecimal } from "@/components/charts/line-chart";
import {
  BOGEY_MINIMUM_MEETINGS,
  type OpponentRecord,
  type OpponentsSeries,
} from "@/lib/head-to-head";

/** The strings agreed in specs/045, each where the spec places it. */
export const OPPONENTS_GROUP_HEADING = "Vastustajat";
export const OPPONENTS_HEADING = "Vaikeimmat vastustajat";
export const THRESHOLD_NOTE = `Vähintään ${BOGEY_MINIMUM_MEETINGS} kohtaamista.`;
export const NO_OPPONENTS_MESSAGE = `Yhtäkään vastustajaa ei ole kohdattu vähintään ${BOGEY_MINIMUM_MEETINGS} kertaa.`;
export const OPPONENTS_ERROR_MESSAGE = "Vastustajia ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "opponents";

type Row = OpponentRecord & { href: string };

/**
 * `O`, `V`, `T` and `H` with the standings table's own titles, so a reader who
 * knows the table knows these (specs/045). `P/O` is the one this panel adds.
 */
const NUMBERS: ReadonlyArray<{ header: string; title: string; value: (row: Row) => string }> = [
  { header: "O", title: "Ottelut", value: (row) => String(row.played) },
  { header: "V", title: "Voitot", value: (row) => String(row.wins) },
  { header: "T", title: "Tasapelit", value: (row) => String(row.draws) },
  { header: "H", title: "Häviöt", value: (row) => String(row.losses) },
  {
    header: "P/O",
    title: "Pisteitä ottelua kohden",
    value: (row) => formatDecimal(row.pointsPerMatch),
  },
];

/**
 * A compact table rather than `DataTable`, deliberately.
 *
 * `DataTable`'s fixed widths exist so sibling tables line up (specs/021), and
 * its 240 px floor for the name column put this one at 480 px — so at 375 px a
 * phone showed `O` and `V` and scrolled `P/O`, the figure the rows are ranked
 * by, out of sight. This table has no sibling to line up with, and at 40 px a
 * number column all six fit a phone's width: names wrap rather than push the
 * numbers away.
 */
function OpponentsTable({ rows }: Readonly<{ rows: readonly Row[] }>) {
  return (
    <table className="w-full table-fixed border-collapse text-left text-sm tabular-nums">
      <colgroup>
        <col />
        {NUMBERS.map((column) => (
          <col className={column.header === "P/O" ? "w-12" : "w-10"} key={column.header} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-border border-b text-muted">
          <th className="py-2 pr-2">Vastustaja</th>
          {NUMBERS.map((column) => (
            <th className="px-1 py-2 text-right" key={column.header} title={column.title}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className="border-border-subtle border-b" key={row.opponentProviderId}>
            <th className="py-2 pr-2 font-medium" scope="row">
              <Link className="hover:underline" href={row.href}>
                {row.opponentName}
              </Link>
            </th>
            {NUMBERS.map((column) => (
              <td className="px-1 py-2 text-right" key={column.header}>
                {column.value(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The `Vaikeimmat vastustajat` panel in `Analyysit` (specs/045): the club's
 * worst opponents across every stored season, each linking to the full
 * head-to-head. `null` means no panel: a national team's page (S5).
 */
export function opponentsPanel(series: OpponentsSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={OPPONENTS_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<OpponentsSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{OPPONENTS_ERROR_MESSAGE}</p>;
  if (series.rows.length === 0) return <p>{NO_OPPONENTS_MESSAGE}</p>;

  return (
    <>
      <OpponentsTable rows={series.rows} />
      <p className="mt-2 text-muted text-sm">
        {THRESHOLD_NOTE} {series.windowSentence}
      </p>
    </>
  );
}
