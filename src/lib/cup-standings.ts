/**
 * A cup's table-producing phase, rendered as one standings table per group.
 *
 * Pure and database-free on purpose: the cup pages call it with a match list
 * they already hold, and it stays testable without mocking the DB.
 * See specs/014-champions-league.md.
 */

import {
  GROUP_STAGE,
  getGroupName,
  getStageName,
  LEAGUE_STAGE,
  resolvePhaseShape,
} from "./cup-stages";
import { calculateStandings, type TeamStanding, toFinishedMatches } from "./standings";

// Structurally what `calculateStandings` needs, plus the two cup fields.
// Both `NormalizedProviderMatch` and a selected `matches` row satisfy it.
type PhaseMatch = {
  providerMatchId: number;
  competitionCode: string;
  seasonId: number;
  matchday: number | null;
  stage: string | null;
  groupName: string | null;
  status: string;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

/** One standings table on a cup page, with the heading it renders under. */
export type CupPhaseTable = {
  /** The provider group this table covers, or null for a single league phase. */
  group: string | null;
  heading: string;
  standings: TeamStanding[];
};

/**
 * A single `LEAGUE_STAGE` yields one table; a `GROUP_STAGE` yields one per
 * group, sorted alphabetically by group rather than by the order the provider
 * happened to return matches in — the two coincide today, and sorting makes
 * the page deterministic if that ever stops being true.
 *
 * Knockout matches never reach `calculateStandings`: only the phase's own
 * matches are passed, so a team's knockout results cannot leak into the table
 * it earned its place in.
 */
export function buildCupPhaseStandings(seasonMatches: PhaseMatch[]): CupPhaseTable[] {
  const shape = resolvePhaseShape(seasonMatches);

  if (shape === "single") {
    const phaseMatches = seasonMatches.filter((match) => match.stage === LEAGUE_STAGE);
    return [
      {
        group: null,
        heading: getStageName(LEAGUE_STAGE),
        standings: calculateStandings(toFinishedMatches(phaseMatches), phaseMatches),
      },
    ];
  }

  if (shape === "grouped") {
    const byGroup = new Map<string, PhaseMatch[]>();
    for (const match of seasonMatches) {
      if (match.stage !== GROUP_STAGE || match.groupName === null) continue;
      const existing = byGroup.get(match.groupName);
      if (existing) existing.push(match);
      else byGroup.set(match.groupName, [match]);
    }

    return [...byGroup.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, groupMatches]) => ({
        group,
        heading: getGroupName(group),
        standings: calculateStandings(toFinishedMatches(groupMatches), groupMatches),
      }));
  }

  return [];
}
