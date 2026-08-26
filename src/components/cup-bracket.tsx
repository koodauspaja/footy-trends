import Link from "next/link";
import type { BracketLeg, BracketRound, BracketTie, TieDecision } from "@/lib/cup-bracket";
import { getStageName } from "@/lib/cup-stages";
import { formatMatchResult } from "@/lib/standings";
import { matchDateFormatter } from "./match-list-table";

/**
 * How a tie was settled, appended to the aggregate. `ja` is jatkoaika (extra
 * time), `rp` rangaistuspotkut (penalties). A tie settled in normal time gets
 * no suffix — the aggregate alone says it.
 */
const DECISION_SUFFIX: Record<TieDecision, string> = {
  regular: "",
  extra_time: " (ja)",
  penalties: " (rp)",
};

const NO_BRACKET_MESSAGE = "Pudotuspelit eivät ole vielä alkaneet.";

type CupBracketProps = {
  rounds: BracketRound[];
  /** Builds a team's link href, matching how the standings table links its rows. */
  teamHref: (teamProviderId: number) => string;
};

/**
 * A leg's own result: normal time plus extra time, with the shootout stated
 * separately rather than folded in. `formatMatchResult` alone would print
 * 0-1 for a shootout leg and lose the fact that it went to penalties.
 */
function formatLeg(leg: BracketLeg): string {
  const score = formatMatchResult(leg.homeGoals, leg.awayGoals);
  if (leg.penaltiesHome === null || leg.penaltiesAway === null) return score;
  return `${score} (rp ${leg.penaltiesHome}–${leg.penaltiesAway})`;
}

function formatAggregate(tie: BracketTie): string {
  if (tie.aggregateHome === null || tie.aggregateAway === null) return "–";
  return `${tie.aggregateHome}–${tie.aggregateAway}${tie.decision ? DECISION_SUFFIX[tie.decision] : ""}`;
}

function TeamName({
  teamProviderId,
  teamName,
  isWinner,
  teamHref,
}: Readonly<{
  teamProviderId: number;
  teamName: string;
  isWinner: boolean;
  teamHref: (teamProviderId: number) => string;
}>) {
  return (
    <Link
      className={`hover:underline${isWinner ? " font-semibold" : ""}`}
      href={teamHref(teamProviderId)}
    >
      {teamName}
    </Link>
  );
}

/**
 * The knockout rounds as one table per round: both teams, the aggregate, and
 * each leg's own result. A drawn tree is deliberately not attempted — the
 * rounds this renders are at most eight ties wide, and a table stays readable
 * on a phone where a tree does not.
 *
 * Only the rounds in `BRACKET_STAGES` reach here; earlier knockout rounds stay
 * on the match list, where 16 or more ties are easier to scan.
 */
export function CupBracket({ rounds, teamHref }: Readonly<CupBracketProps>) {
  if (rounds.length === 0) return <p>{NO_BRACKET_MESSAGE}</p>;

  return (
    <div className="flex flex-col gap-6">
      {rounds.map((round) => (
        <section key={round.stage}>
          <h3 className="mb-2 font-medium">{getStageName(round.stage)}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                  <th className="p-3">Ottelupari</th>
                  <th className="p-3">Yhteistulos</th>
                  <th className="p-3">Osaottelut</th>
                </tr>
              </thead>
              <tbody>
                {round.ties.map((tie) => (
                  <tr className="border-b border-zinc-200" key={tie.key}>
                    <td className="p-3">
                      <TeamName
                        teamProviderId={tie.home.teamProviderId}
                        teamName={tie.home.teamName}
                        isWinner={tie.winnerTeamProviderId === tie.home.teamProviderId}
                        teamHref={teamHref}
                      />
                      {" – "}
                      <TeamName
                        teamProviderId={tie.away.teamProviderId}
                        teamName={tie.away.teamName}
                        isWinner={tie.winnerTeamProviderId === tie.away.teamProviderId}
                        teamHref={teamHref}
                      />
                    </td>
                    <td className="p-3">{formatAggregate(tie)}</td>
                    <td className="p-3 text-sm text-zinc-600">
                      {tie.legs.map((leg) => (
                        <div key={leg.providerMatchId}>
                          {`${matchDateFormatter.format(leg.kickoffAt)} ${leg.homeTeamName} – ${leg.awayTeamName} ${formatLeg(leg)}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
