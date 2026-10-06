/**
 * Finnish cup rounds: what to call them, and which of them form the bracket.
 *
 * decisions/015-finnish-cups.md
 * decisions/043-liigacup.md
 */

import { type BracketRound, type BracketSourceMatch, buildBracket } from "./cup-bracket";

/**
 * The two round names TASO spells inconsistently across eras, normalised.
 * Keyed on the whole name, never a substring.
 *
 * decisions/015-finnish-cups.md
 */
const ROUND_NAME_OVERRIDES = new Map([["Finaali", "Loppuottelu"]]);

const NUMBERED_ROUND = /^(\d+)\.\s*Kierros$/;

export function normaliseRoundName(groupName: string): string {
  const numbered = NUMBERED_ROUND.exec(groupName);
  if (numbered) return `Kierros ${numbered[1]}`;
  return ROUND_NAME_OVERRIDES.get(groupName) ?? groupName;
}

/**
 * A knockout group, as far as bracket selection cares. `teamCount` is the
 * distinct teams in the group's own matches.
 *
 * decisions/015-finnish-cups.md
 */
export type CupRoundGroup = {
  groupId: number;
  groupName: string;
  teamCount: number;
};

/**
 * Quarter-final, semi-final, final: the rounds the tree is drawn for.
 *
 * decisions/015-finnish-cups.md
 */
const BRACKET_SIZES = [2, 4, 8];

/**
 * The closing rounds to draw, earliest first, or `[]` for none: walking back
 * from the last group, the latest of 2 teams, then of 4, then of 8. `groups` is
 * in TASO's order, table-keeping groups removed.
 *
 * decisions/015-finnish-cups.md
 */
export function selectBracketRounds<T extends CupRoundGroup>(groups: T[]): T[] {
  const chosen: T[] = [];
  // Exclusive upper bound: each round must sit before the one it feeds.
  let before = groups.length;

  for (const size of BRACKET_SIZES) {
    const index = groups.findLastIndex((group, at) => at < before && group.teamCount === size);
    if (index === -1) break;
    chosen.push(groups[index] as T);
    before = index;
  }

  return chosen.reverse();
}

/**
 * The fields the bracket needs from a TASO match: narrower than
 * `BracketSourceMatch`, as TASO carries no score breakdown.
 *
 * decisions/015-finnish-cups.md
 */
export type CupKnockoutMatch = {
  providerMatchId: number;
  status: string;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  /** TASO's own verdict on who went through; `"tie"` never occurs in a cup. */
  winner: "home" | "away" | "tie" | null;
};

/**
 * A TASO knockout group and its own matches, as the bracket adapter needs them.
 *
 * decisions/015-finnish-cups.md
 */
export type CupKnockoutGroup = {
  groupId: number;
  groupName: string;
  matches: CupKnockoutMatch[];
};

/**
 * The two teams of a match: all a structural check needs.
 *
 * decisions/043-liigacup.md
 */
type Pairing = { homeTeamProviderId: number; awayTeamProviderId: number };

function teamsIn(matches: readonly Pairing[]): Set<number> {
  return new Set(matches.flatMap((match) => [match.homeTeamProviderId, match.awayTeamProviderId]));
}

function pairKey(left: number, right: number): string {
  return left < right ? `${left}-${right}` : `${right}-${left}`;
}

/**
 * Whether a cup group is a round-robin: at least three teams, and every pair of
 * them with a match in the group, played or scheduled.
 *
 * decisions/043-liigacup.md
 */
export function isRoundRobin(matches: readonly Pairing[]): boolean {
  const teams = [...teamsIn(matches)];
  if (teams.length < 3) return false;

  const met = new Set(
    matches.map((match) => pairKey(match.homeTeamProviderId, match.awayTeamProviderId))
  );
  return teams.every((team, index) =>
    teams.slice(index + 1).every((other) => met.has(pairKey(team, other)))
  );
}

/**
 * The team TASO says went through, or `null` while that is not yet known.
 *
 * decisions/043-liigacup.md
 */
function advancingTeam(match: CupKnockoutMatch): number | null {
  if (match.winner === "home") return match.homeTeamProviderId;
  if (match.winner === "away") return match.awayTeamProviderId;
  return null;
}

const SEMI_FINALS = "Välierät";
const FINAL = "Loppuottelu";

/**
 * A knockout group that holds semi-finals and final together, split into those
 * two rounds; any other group comes back whole.
 *
 * decisions/043-liigacup.md
 */
export function splitCombinedKnockout(group: CupKnockoutGroup): CupKnockoutGroup[] {
  if (group.matches.length !== 3 || teamsIn(group.matches).size !== 4) return [group];

  const [first, second, last] = [...group.matches].sort(
    (left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime()
  ) as [CupKnockoutMatch, CupKnockoutMatch, CupKnockoutMatch];

  const semiWinners = new Set([advancingTeam(first), advancingTeam(second)]);
  const isDecidedFinal =
    !semiWinners.has(null) &&
    semiWinners.has(last.homeTeamProviderId) &&
    semiWinners.has(last.awayTeamProviderId) &&
    advancingTeam(last) !== null;
  if (!isDecidedFinal) return [group];

  return [
    { groupId: group.groupId, groupName: SEMI_FINALS, matches: [first, second] },
    { groupId: group.groupId, groupName: FINAL, matches: [last] },
  ];
}

/**
 * A Finnish cup's knockout rounds as a drawn bracket, or `[]` when the season
 * has none. The rounds are keyed by their normalised name.
 *
 * decisions/015-finnish-cups.md
 */
export function buildCupBracket(knockoutGroups: CupKnockoutGroup[]): BracketRound[] {
  return bracketFrom(chooseRounds(knockoutGroups));
}

/**
 * A `groups-and-playoff` cup's playoff, split into rounds and drawn as any
 * cup's is, with the groups the tree drew.
 *
 * decisions/043-liigacup.md
 */
export function buildPlayoffBracket(knockoutGroups: CupKnockoutGroup[]): {
  rounds: BracketRound[];
  drawnGroupIds: Set<number>;
} {
  const chosen = chooseRounds(knockoutGroups.flatMap(splitCombinedKnockout));
  return {
    rounds: bracketFrom(chosen),
    drawnGroupIds: new Set(chosen.map((round) => round.groupId)),
  };
}

function chooseRounds(knockoutGroups: CupKnockoutGroup[]): CupKnockoutGroup[] {
  // The candidates carry their own matches, so the chosen rounds come back
  // with them and there is no lookup that could miss.
  return selectBracketRounds(
    knockoutGroups.map((group) => ({ ...group, teamCount: teamsIn(group.matches).size }))
  );
}

function bracketFrom(chosen: CupKnockoutGroup[]): BracketRound[] {
  if (chosen.length === 0) return [];

  const stages = chosen.map((round) => normaliseRoundName(round.groupName));
  const matches: BracketSourceMatch[] = chosen.flatMap((round) =>
    round.matches.map((match) => ({
      ...match,
      stage: normaliseRoundName(round.groupName),
      // TASO publishes only the final score, so there is no breakdown to fill in.
      regularTimeHome: null,
      regularTimeAway: null,
      extraTimeHome: null,
      extraTimeAway: null,
      penaltiesHome: null,
      penaltiesAway: null,
      // What settles a level cup tie. TASO reports the outcome without the
      // shootout, so the score alone would leave FC Haka 1-1 KuPS looking
      // drawn while KuPS plays the semi-final.
      declaredWinner: match.winner === "tie" ? null : match.winner,
    }))
  );

  return buildBracket(matches, stages);
}
