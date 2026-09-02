import Link from "next/link";
import { COLUMN_WIDTHS, DataTable, type DataTableColumn } from "@/components/data-table";

const statColumns = [
  ["O", "Ottelut", (row: StandingsRow) => row.played],
  ["V", "Voitot", (row: StandingsRow) => row.won],
  ["T", "Tasapelit", (row: StandingsRow) => row.drawn],
  ["H", "Häviöt", (row: StandingsRow) => row.lost],
  ["TM", "Tehdyt maalit", (row: StandingsRow) => row.goalsFor],
  ["PM", "Päästetyt maalit", (row: StandingsRow) => row.goalsAgainst],
  ["ME", "Maaliero", (row: StandingsRow) => row.goalDifference],
  ["P", "Pisteet", (row: StandingsRow) => row.points],
] as const;

/**
 * Nullable stat fields, so this accepts both `TeamStanding` (football-data,
 * always numeric) and `TasoTeamStanding`, whose fields are typed nullable
 * because TASO reports them optionally. A `null` renders as "–" rather
 * than a misleading `0`.
 */
export type StandingsRow = {
  position: number;
  teamProviderId: number;
  teamName: string;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
  points: number | null;
  form: ReadonlyArray<{ matchId: number; result: string; label: string }>;
};

function cell(value: number | null): string {
  return value === null ? "–" : String(value);
}

/**
 * The Sija/Joukkue/O-V-T-H-TM-PM-ME-P/Vire table shared by `/ulkomaat/sarjataulukko`
 * and `/kotimaa/sarjataulukko` — identical markup and Finnish column
 * headers on both; only the team-link target differs.
 *
 * The stats are right-aligned so digits line up by place value, which is most
 * of what a standings table is for; `Sija` stays left, where it reads as a
 * label beside the team name rather than a quantity to compare. `Joukkue` is
 * the flexible column, so the numbers stay grouped on a wide screen instead of
 * being strung across it — and every table on the page has the same columns as
 * its siblings, which they did not before. See specs/021-table-consistency.md.
 */
export function StandingsTable({
  standings,
  teamHref,
}: Readonly<{
  standings: readonly StandingsRow[];
  teamHref: (teamProviderId: number) => string;
}>) {
  const columns: Array<DataTableColumn<StandingsRow>> = [
    {
      key: "position",
      header: "Sija",
      width: COLUMN_WIDTHS.position,
      render: (row) => row.position,
    },
    {
      key: "team",
      header: "Joukkue",
      width: "flex",
      rowHeader: true,
      cellClassName: "font-medium",
      // A pass-through group's team can lack an id (see toPassThroughStanding); no id, no link.
      render: (row) =>
        row.teamProviderId === 0 ? (
          row.teamName
        ) : (
          <Link className="hover:underline" href={teamHref(row.teamProviderId)}>
            {row.teamName}
          </Link>
        ),
    },
    ...statColumns.map(([short, title, value]) => ({
      key: short,
      header: short,
      headerTitle: title,
      width: COLUMN_WIDTHS.stat,
      align: "right" as const,
      // Points carry the weight, as they always have.
      ...(short === "P" ? { cellClassName: "font-semibold" } : {}),
      render: (row: StandingsRow) => cell(value(row)),
    })),
    {
      key: "form",
      header: "Vire",
      width: COLUMN_WIDTHS.form,
      cellLabel: (row) => row.form.map((item) => item.label).join(", "),
      render: (row) =>
        row.form.map((item) => (
          <span className="mr-1" key={item.matchId} title={item.label}>
            {item.result}
          </span>
        )),
    },
  ];

  return <DataTable columns={columns} rowKey={(row) => row.teamProviderId} rows={standings} />;
}

/**
 * The column-abbreviation legend below the table. Separate from
 * `StandingsTable` because `/kotimaa/sarjataulukko` renders several tables
 * (one per group) but only one legend, at the very bottom.
 */
export function StandingsLegend() {
  return (
    <p className="mt-4 text-sm text-zinc-500">
      O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt maalit,
      ME = maaliero, P = pisteet.
    </p>
  );
}
