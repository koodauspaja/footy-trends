import Link from "next/link";
import type { ReactNode } from "react";
import { COLUMN_WIDTHS, DataTable, type DataTableColumn } from "@/components/data-table";
import { formatMatchResult } from "@/lib/standings";

export const matchDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export type MatchListRow = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

type MatchListTableProps<T extends MatchListRow> = {
  matches: T[];
  /** Builds a team's link href, or `null` on a team page, where a team's own name isn't a link to itself. */
  teamHref: ((teamProviderId: number) => string) | null;
  /** Omitted on the season-wide `/ulkomaat/ottelut` page, which has no fourth column at all. */
  fourthColumn?: { header: string; render: (match: T) => ReactNode };
  /**
   * Builds a row's match-page href. `null` or omitted leaves **this table's**
   * dates as plain text — the opt-out is per table, not per row, because no
   * caller has ever needed one row to differ from its neighbours.
   *
   * The date carries the link rather than the row: `Pvm` is the one column
   * every one of these tables has, it is never a link otherwise, and it does
   * not nest inside the team links the `Ottelu` column already carries. See
   * specs/019-match-page.md.
   */
  matchHref?: ((match: T) => string) | null;
};

/**
 * The Pvm/Ottelu/Tulos table shared by every matches/team-match-list page —
 * football-data.org's `/ulkomaat/ottelut` and `/ulkomaat/joukkue/:id`, and `/kotimaa`'s
 * equivalents. Only the team-name link behavior and the fourth column
 * (Kierros' matchday vs Sarja's group name) actually differ between them —
 * generic over `T` so `fourthColumn.render` keeps access to whichever
 * provider-specific field it needs.
 *
 * The first three columns are fixed at the same widths whether or not a fourth
 * exists, so a phase without a round number still lines up with one that has
 * it, and a list's width no longer depends on how long its team names are — the
 * same component rendered 217px apart on `/kotimaa` and the Champions League
 * page before this. See specs/021-table-consistency.md.
 */
export function MatchListTable<T extends MatchListRow>({
  matches,
  teamHref,
  fourthColumn,
  matchHref,
}: Readonly<MatchListTableProps<T>>) {
  const columns: Array<DataTableColumn<T>> = [
    {
      key: "date",
      header: "Pvm",
      width: COLUMN_WIDTHS.date,
      render: (match) =>
        matchHref ? (
          <Link className="hover:underline" href={matchHref(match)}>
            {matchDateFormatter.format(match.kickoffAt)}
          </Link>
        ) : (
          matchDateFormatter.format(match.kickoffAt)
        ),
    },
    {
      key: "match",
      header: "Ottelu",
      width: "flex",
      render: (match) =>
        teamHref ? (
          <>
            <Link className="hover:underline" href={teamHref(match.homeTeamProviderId)}>
              {match.homeTeamName}
            </Link>
            {" – "}
            <Link className="hover:underline" href={teamHref(match.awayTeamProviderId)}>
              {match.awayTeamName}
            </Link>
          </>
        ) : (
          `${match.homeTeamName} – ${match.awayTeamName}`
        ),
    },
    {
      key: "result",
      header: "Tulos",
      width: COLUMN_WIDTHS.score,
      // Left, unlike the standings' numbers: `2–1` is a pair rather than a
      // magnitude, and right-aligning it would line up the away goals, which
      // means nothing.
      render: (match) => formatMatchResult(match.homeGoals, match.awayGoals),
    },
  ];

  if (fourthColumn) {
    columns.push({
      key: "fourth",
      header: fourthColumn.header,
      width: COLUMN_WIDTHS.label,
      // A round is a quantity and reaches two digits; a series or competition
      // name is text.
      ...(fourthColumn.header === "Kierros" ? { align: "right" as const } : {}),
      render: (match) => fourthColumn.render(match),
    });
  }

  return <DataTable columns={columns} rowKey={(match) => match.providerMatchId} rows={matches} />;
}
