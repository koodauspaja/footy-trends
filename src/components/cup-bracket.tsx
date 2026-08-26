import Link from "next/link";
import type { BracketLeg, BracketRound, BracketTie, TieDecision } from "@/lib/cup-bracket";
import { getStageName, isDrawnStage } from "@/lib/cup-stages";
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

type TeamHref = (teamProviderId: number) => string;

type CupBracketProps = {
  rounds: BracketRound[];
  /** Builds a team's link href, matching how the standings table links its rows. */
  teamHref: TeamHref;
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
  const suffix =
    tie.penaltiesHome !== null && tie.penaltiesAway !== null
      ? ` (rp ${tie.penaltiesHome}–${tie.penaltiesAway})`
      : (tie.decision && DECISION_SUFFIX[tie.decision]) || "";
  return `${tie.aggregateHome}–${tie.aggregateAway}${suffix}`;
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
  teamHref: TeamHref;
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
 * One side of a tie inside a drawn card: team on the left, its aggregate on the
 * right, and its shootout score in parentheses after it when the tie went to
 * penalties — the usual football convention, `4 (3)`.
 */
function TieSide({
  team,
  goals,
  penalties,
  isWinner,
  teamHref,
}: Readonly<{
  team: { teamProviderId: number; teamName: string };
  goals: number | null;
  penalties: number | null;
  isWinner: boolean;
  teamHref: TeamHref;
}>) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 break-words">
        <TeamName
          isWinner={isWinner}
          teamHref={teamHref}
          teamName={team.teamName}
          teamProviderId={team.teamProviderId}
        />
      </span>
      <span className={`shrink-0 text-sm tabular-nums${isWinner ? " font-semibold" : ""}`}>
        {goals === null ? "–" : goals}
        {penalties !== null && (
          <span className="ml-1 font-normal text-zinc-500">{`(${penalties})`}</span>
        )}
      </span>
    </div>
  );
}

/**
 * One tie as a card in the tree. The connector stub on the right is decorative
 * — it joins the card to the round beside it, and is hidden from assistive
 * technology, which reads the round headings instead.
 */
function TieCard({
  tie,
  isLastRound,
  teamHref,
}: Readonly<{ tie: BracketTie; isLastRound: boolean; teamHref: TeamHref }>) {
  const suffix = tie.decision ? DECISION_SUFFIX[tie.decision].trim() : "";

  return (
    <li className="relative">
      <div className="rounded border border-zinc-200 px-3 py-2">
        <TieSide
          goals={tie.aggregateHome}
          isWinner={tie.winnerTeamProviderId === tie.home.teamProviderId}
          penalties={tie.penaltiesHome}
          team={tie.home}
          teamHref={teamHref}
        />
        <TieSide
          goals={tie.aggregateAway}
          isWinner={tie.winnerTeamProviderId === tie.away.teamProviderId}
          penalties={tie.penaltiesAway}
          team={tie.away}
          teamHref={teamHref}
        />
        {suffix && <p className="mt-1 text-xs text-zinc-500">{suffix}</p>}
      </div>
      {!isLastRound && (
        <span
          aria-hidden="true"
          className="-right-4 absolute top-1/2 w-4 border-zinc-300 border-t"
        />
      )}
    </li>
  );
}

/** The drawn tree: one column per round, later rounds centred against their feeders. */
function BracketTree({ rounds, teamHref }: Readonly<CupBracketProps>) {
  return (
    <div className="overflow-x-auto pr-1">
      <div className="flex w-max gap-8">
        {rounds.map((round, index) => (
          <section className="flex w-56 shrink-0 flex-col" key={round.stage}>
            <h3 className="mb-3 font-medium text-sm text-zinc-600">{getStageName(round.stage)}</h3>
            <ul className="flex flex-1 flex-col justify-around gap-4">
              {round.ties.map((tie) => (
                <TieCard
                  isLastRound={index === rounds.length - 1}
                  key={tie.key}
                  teamHref={teamHref}
                  tie={tie}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** An earlier knockout round, as a table of resolved ties. */
function RoundTable({ round, teamHref }: Readonly<{ round: BracketRound; teamHref: TeamHref }>) {
  return (
    <section>
      <h3 className="mb-2 font-medium">{getStageName(round.stage)}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-zinc-300 border-b text-sm text-zinc-600">
              <th className="p-3">Ottelupari</th>
              <th className="p-3">Yhteistulos</th>
              <th className="p-3">Osaottelut</th>
            </tr>
          </thead>
          <tbody>
            {round.ties.map((tie) => (
              <tr className="border-zinc-200 border-b" key={tie.key}>
                <td className="p-3">
                  <TeamName
                    isWinner={tie.winnerTeamProviderId === tie.home.teamProviderId}
                    teamHref={teamHref}
                    teamName={tie.home.teamName}
                    teamProviderId={tie.home.teamProviderId}
                  />
                  {" – "}
                  <TeamName
                    isWinner={tie.winnerTeamProviderId === tie.away.teamProviderId}
                    teamHref={teamHref}
                    teamName={tie.away.teamName}
                    teamProviderId={tie.away.teamProviderId}
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
  );
}

/**
 * The knockout phase in two parts: the rounds before the quarter-finals as
 * tables, then the quarter-finals onward as a drawn tree.
 *
 * The split is a readability limit, not a preference. `LAST_16` is eight ties
 * across and `LAST_32` sixteen, which no tree survives on a phone; from the
 * quarter-finals the tree is three columns and shows what a list cannot —
 * who plays whom next.
 */
export function CupBracket({ rounds, teamHref }: Readonly<CupBracketProps>) {
  if (rounds.length === 0) return <p>{NO_BRACKET_MESSAGE}</p>;

  const listed = rounds.filter((round) => !isDrawnStage(round.stage));
  const drawn = rounds.filter((round) => isDrawnStage(round.stage));

  return (
    <div className="flex flex-col gap-8">
      {listed.map((round) => (
        <RoundTable key={round.stage} round={round} teamHref={teamHref} />
      ))}
      {drawn.length > 0 && <BracketTree rounds={drawn} teamHref={teamHref} />}
    </div>
  );
}
