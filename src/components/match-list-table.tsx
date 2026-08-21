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
  /** Omitted on the season-wide `/ottelut` page, which has no fourth column at all. */
  fourthColumn?: { header: string; render: (match: T) => ReactNode };
};

/**
 * The Pvm/Ottelu/Tulos table shared by every matches/team-match-list page —
 * football-data.org's `/ottelut` and `/joukkue/:id`, and `/kotimaa`'s
 * equivalents. Only the team-name link behavior and the fourth column
 * (Kierros' matchday vs Sarja's group name) actually differ between them —
 * generic over `T` so `fourthColumn.render` keeps access to whichever
 * provider-specific field it needs.
 */
export function MatchListTable<T extends MatchListRow>({
  matches,
  teamHref,
  fourthColumn,
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
              <td className="p-3">{matchDateFormatter.format(match.kickoffAt)}</td>
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
