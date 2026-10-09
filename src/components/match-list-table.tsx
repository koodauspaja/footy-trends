import type { ReactNode } from "react";
import { COLUMN_WIDTHS, DataTable, type DataTableColumn } from "@/components/data-table";
import { RowLink } from "@/components/row-link";
import { formatScore, type ScoreBreakdown } from "@/lib/match-detail";

export const matchDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * A listed match. The score breakdown is optional: football-data rows carry it,
 * and a TASO row, which has none, prints its score as it is.
 *
 * decisions/009-veikkausliiga.md
 * decisions/498-match-list-score.md
 */
export type MatchListRow = ScoreBreakdown & {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
};

type MatchListTableProps<T extends MatchListRow> = {
  matches: T[];
  /**
   * Builds a team's link href, or `null` on a team page, where a team's own name
   * isn't a link to itself.
   */
  teamHref: ((teamProviderId: number) => string) | null;
  /** Omitted on the season-wide `/ulkomaat/ottelut` page, which has no fourth column at all. */
  fourthColumn?: { header: string; render: (match: T) => ReactNode };
  /**
   * Builds a row's match-page href, carried by the date. `null` or omitted
   * leaves this table's dates as plain text: the opt-out is per table.
   */
  matchHref?: ((match: T) => string) | null;
};

/**
 * The Pvm/Ottelu/Tulos table shared by every match list. Generic over `T`, so
 * `fourthColumn.render` keeps access to its provider's fields. The first three
 * columns have the same widths whether or not a fourth exists.
 *
 * decisions/009-veikkausliiga.md
 * decisions/019-match-page.md
 * decisions/021-table-consistency.md
 * decisions/498-match-list-score.md
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
          <RowLink className="hover:underline" href={matchHref(match)}>
            {matchDateFormatter.format(match.kickoffAt)}
          </RowLink>
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
            <RowLink className="hover:underline" href={teamHref(match.homeTeamProviderId)}>
              {match.homeTeamName}
            </RowLink>
            {" – "}
            <RowLink className="hover:underline" href={teamHref(match.awayTeamProviderId)}>
              {match.awayTeamName}
            </RowLink>
          </>
        ) : (
          `${match.homeTeamName} – ${match.awayTeamName}`
        ),
    },
    {
      key: "result",
      header: "Tulos",
      width: COLUMN_WIDTHS.score,
      // Left, unlike the standings' numbers: `2–1` is a pair, not a magnitude.
      // The match page's own score: after extra time, a shoot-out stated as
      // `(rp 3–4)` and extra time as `(ja)`.
      render: (match) => formatScore(match),
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
