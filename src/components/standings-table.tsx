import { COLUMN_WIDTHS, DataTable, type DataTableColumn } from "@/components/data-table";
import { FavouriteToggle } from "@/components/favourite-toggle";
import { RowLink } from "@/components/row-link";
import type { FavouriteSource } from "@/lib/favourite-keys";

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
 * One row. The stat fields are nullable, so this accepts both `TeamStanding`
 * and `TasoTeamStanding`; a `null` renders as "–", not as a misleading `0`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
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
 * The Sija/Joukkue/O-V-T-H-TM-PM-ME-P/Vire table shared by
 * `/ulkomaat/sarjataulukko` and `/kotimaa/sarjataulukko`; only the team-link
 * target differs. `Joukkue` is the flexible column.
 *
 * decisions/009-veikkausliiga.md
 * decisions/021-table-consistency.md
 * decisions/026-favourites.md
 */
export function StandingsTable({
  standings,
  teamHref,
  favouriteSource,
}: Readonly<{
  standings: readonly StandingsRow[];
  teamHref: (teamProviderId: number) => string;
  /**
   * Which provider's id space the rows are in, so a row can offer a favourite
   * toggle. Optional: a table without it shows no stars.
   */
  favouriteSource?: FavouriteSource;
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
          <span className="flex items-center gap-1">
            <RowLink className="hover:underline" href={teamHref(row.teamProviderId)}>
              {row.teamName}
            </RowLink>
            {/* No id, no star: the same rule as the link above it, since a
                pass-through group's row is not a team anyone can follow. */}
            {favouriteSource !== undefined && (
              <FavouriteToggle
                kind="team"
                name={row.teamName}
                source={favouriteSource}
                teamProviderId={row.teamProviderId}
              />
            )}
          </span>
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
 *
 * decisions/009-veikkausliiga.md
 */
export function StandingsLegend() {
  return (
    <p className="mt-4 text-sm text-muted">
      O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt maalit,
      ME = maaliero, P = pisteet.
    </p>
  );
}
