import Link from "next/link";

const columns = [
  ["O", "Ottelut"],
  ["V", "Voitot"],
  ["T", "Tasapelit"],
  ["H", "Häviöt"],
  ["TM", "Tehdyt maalit"],
  ["PM", "Päästetyt maalit"],
  ["ME", "Maaliero"],
  ["P", "Pisteet"],
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
 */
export function StandingsTable({
  standings,
  teamHref,
}: Readonly<{
  standings: readonly StandingsRow[];
  teamHref: (teamProviderId: number) => string;
}>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-300 text-sm text-zinc-600">
            <th className="p-3">Sija</th>
            <th className="p-3">Joukkue</th>
            {columns.map(([short, title]) => (
              <th className="p-3" key={short} title={title}>
                {short}
              </th>
            ))}
            <th className="p-3">Vire</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => (
            <tr className="border-b border-zinc-200" key={team.teamProviderId}>
              <td className="p-3">{team.position}</td>
              <th scope="row" className="p-3 font-medium">
                {/* A pass-through group's team can lack an id (see toPassThroughStanding); no id, no link. */}
                {team.teamProviderId === 0 ? (
                  team.teamName
                ) : (
                  <Link className="hover:underline" href={teamHref(team.teamProviderId)}>
                    {team.teamName}
                  </Link>
                )}
              </th>
              <td className="p-3">{cell(team.played)}</td>
              <td className="p-3">{cell(team.won)}</td>
              <td className="p-3">{cell(team.drawn)}</td>
              <td className="p-3">{cell(team.lost)}</td>
              <td className="p-3">{cell(team.goalsFor)}</td>
              <td className="p-3">{cell(team.goalsAgainst)}</td>
              <td className="p-3">{cell(team.goalDifference)}</td>
              <td className="p-3 font-semibold">{cell(team.points)}</td>
              <td className="p-3" aria-label={team.form.map((item) => item.label).join(", ")}>
                {team.form.map((item) => (
                  <span className="mr-1" key={item.matchId} title={item.label}>
                    {item.result}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
