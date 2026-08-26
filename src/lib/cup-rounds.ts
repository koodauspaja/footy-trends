/**
 * Finnish cup rounds: what to call them, and which of them form the bracket.
 * See specs/015-finnish-cups.md.
 */

import { type BracketRound, type BracketSourceMatch, buildBracket } from "./cup-bracket";

/**
 * TASO spells two rounds inconsistently across eras, and only these two are
 * normalised. Counted over every MSC and NSC season 2015-2026:
 *
 * - `Kierros N` (63) vs `N. Kierros` (23) — the common form simply wins.
 * - `Loppuottelu` (9) vs `Finaali` (11) — the *less* common form wins, because
 *   that split is by era rather than popularity (`Finaali` 2015-2019,
 *   `Loppuottelu` 2020 onward). The count only favours `Finaali` because the
 *   older era has more seasons in range, and it reverses as seasons
 *   accumulate.
 *
 * Keyed on the whole name, never a substring: `Pikkufinaali` is the
 * third-place match and `Finaali-Kakkonen` a separate Kakkonen-cup round, and
 * a substring replace would mangle both.
 *
 * Every other group name — `Juuson kierros`, `Tasaus`, `Superkierros`,
 * `Kierros 1B` and some 50 more — is TASO's own and already Finnish.
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
 * number of distinct teams appearing in the group's own matches — not
 * `getGroups`' row count, which returns one row per bracket *slot*.
 */
export type CupRoundGroup = {
  groupId: number;
  groupName: string;
  teamCount: number;
};

/** Quarter-final, semi-final, final — the rounds the tree is drawn for. */
const BRACKET_SIZES = [2, 4, 8];

/**
 * The closing rounds to draw, earliest first, or `[]` when the season has none.
 *
 * Walks **backwards** from the last group: the latest 2-team knockout group is
 * the final, then the latest 4-team group before it, then the latest 8-team
 * group before that. Stops at 8 — `LAST_16` is eight ties wide and no tree
 * survives that on a phone.
 *
 * Neither names nor team counts work alone, and all three counter-examples are
 * real (verified live 2026-08-26):
 *
 * - **MSC 2018** `Kierros 1` has 8 teams — the *first* round. Rejected because
 *   `Puolivälierät` is a later 8-team group and claims the slot.
 * - **NSC 2015** `Pikkufinaali` (2 teams) sits *before* `Finaali` (2 teams).
 *   Rejected because `Finaali` is later; it falls out of the chain and renders
 *   as a list, which is what a third-place match should be.
 * - **MSC 2021** has six 4-team groups that keep tables and no knockout at
 *   all. Rejected because the caller passes only table-less groups, and no
 *   2-team group remains.
 *
 * `groups` must be in TASO's own group order, table-keeping groups already
 * removed.
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
 * The fields the bracket needs from a TASO match. Deliberately narrower than
 * `BracketSourceMatch`: TASO carries no score breakdown, so the adapter fills
 * those in as null rather than making every caller supply them.
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

/** A TASO knockout group and its own matches, as the bracket adapter needs them. */
export type CupKnockoutGroup = {
  groupId: number;
  groupName: string;
  matches: CupKnockoutMatch[];
};

/**
 * A Finnish cup's knockout rounds as a drawn bracket, or `[]` when the season
 * has none.
 *
 * `teamCount` comes from the distinct teams in the group's own matches rather
 * than `getGroups`' row count, which returns one row per bracket *slot* — the
 * same reason those groups have no standings table
 * (specs/010-playoff-group-match-list.md).
 *
 * The chosen rounds are keyed by their normalised name, which is what
 * `BracketTree` shows as the column heading. Selection picks at most one group
 * per size, so two chosen rounds sharing a name is not reachable in practice;
 * were it ever to happen the two would merge into one column, which is visible
 * rather than silent.
 */
export function buildCupBracket(knockoutGroups: CupKnockoutGroup[]): BracketRound[] {
  // The candidates carry their own matches, so the chosen rounds come back
  // with them and there is no lookup that could miss.
  const chosen = selectBracketRounds(
    knockoutGroups.map((group) => ({
      ...group,
      teamCount: new Set(
        group.matches.flatMap((match) => [match.homeTeamProviderId, match.awayTeamProviderId])
      ).size,
    }))
  );
  if (chosen.length === 0) return [];

  const stages = chosen.map((round) => normaliseRoundName(round.groupName));
  const matches: BracketSourceMatch[] = chosen.flatMap((round) =>
    round.matches.map((match) => ({
      ...match,
      stage: normaliseRoundName(round.groupName),
      // TASO publishes only the final score. A Finnish cup tie decided on
      // penalties therefore shows that score as it stands, with no shootout
      // breakdown to separate out — unlike football-data, whose `fullTime`
      // folds the shootout in and has to be unpicked.
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
