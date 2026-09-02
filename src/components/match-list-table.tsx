import Link from "next/link";
import type { ReactNode } from "react";
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
   * Builds a row's match-page href, or `null`/omitted where a row should not
   * link.
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
 */
export function MatchListTable<T extends MatchListRow>({
  matches,
  teamHref,
  fourthColumn,
  matchHref,
}: Readonly<MatchListTableProps<T>>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-300 text-sm text-zinc-600">
            <th className="p-3">Pvm</th>
            <th className="p-3">Ottelu</th>
            <th className="p-3">Tulos</th>
            {fourthColumn && <th className="p-3">{fourthColumn.header}</th>}
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr className="border-b border-zinc-200" key={match.providerMatchId}>
              <td className="p-3">
                {matchHref ? (
                  <Link className="hover:underline" href={matchHref(match)}>
                    {matchDateFormatter.format(match.kickoffAt)}
                  </Link>
                ) : (
                  matchDateFormatter.format(match.kickoffAt)
                )}
              </td>
              <td className="p-3">
                {teamHref ? (
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
                )}
              </td>
              <td className="p-3">{formatMatchResult(match.homeGoals, match.awayGoals)}</td>
              {fourthColumn && <td className="p-3">{fourthColumn.render(match)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
