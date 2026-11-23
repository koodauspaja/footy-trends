const FINISHED_STATUS = "FINISHED";

/**
 * The minimum a match needs to contribute two teams to the standings roster,
 * regardless of status or score.
 *
 * decisions/008-winless-teams-in-standings.md
 */
export type RosterMatch = {
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
};

// Extends RosterMatch (rather than merely happening to match its shape) so a
// future change to the roster fields here is a compile error at this
// declaration, not a silent mismatch discovered only where the two types meet.
export type NormalizedMatch = RosterMatch & {
  providerMatchId: number;
  competitionCode: string;
  seasonId: number;
  kickoffAt: Date;
  matchday: number | null;
  homeGoals: number;
  awayGoals: number;
};

/**
 * "H–A" for a played match, "–" for one with no final score yet.
 *
 * decisions/009-veikkausliiga.md
 */
export function formatMatchResult(homeGoals: number | null, awayGoals: number | null): string {
  return homeGoals !== null && awayGoals !== null ? `${homeGoals}–${awayGoals}` : "–";
}

/**
 * Narrows to matches with a final score, which is what `calculateStandings`
 * requires. A match that is not `FINISHED` is excluded even if it carries goals.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/014-champions-league.md
 */
export function toFinishedMatches<
  T extends {
    status: string;
    homeGoals: number | null;
    awayGoals: number | null;
    penaltiesHome?: number | null;
    penaltiesAway?: number | null;
  },
>(matchList: T[]): Array<T & { homeGoals: number; awayGoals: number }> {
  return matchList
    .filter(
      (match): match is T & { homeGoals: number; awayGoals: number } =>
        match.status === FINISHED_STATUS && match.homeGoals !== null && match.awayGoals !== null
    )
    .map(withoutShootout);
}

/**
 * A match's score after extra time, without a penalty shoot-out. Both sides of
 * the shoot-out must be stored for it to be subtracted.
 *
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/495-score-after-extra-time.md
 */
function withoutShootout<
  T extends {
    homeGoals: number;
    awayGoals: number;
    penaltiesHome?: number | null;
    penaltiesAway?: number | null;
  },
>(match: T): T {
  const { penaltiesHome, penaltiesAway } = match;
  if (penaltiesHome == null || penaltiesAway == null) return match;
  return {
    ...match,
    homeGoals: match.homeGoals - penaltiesHome,
    awayGoals: match.awayGoals - penaltiesAway,
  };
}

export type FormResult = "V" | "T" | "H";

export type TeamStanding = {
  position: number;
  teamProviderId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: Array<{ matchId: number; result: FormResult; label: string }>;
};

type TeamTotals = Omit<TeamStanding, "position" | "goalDifference" | "form"> & {
  results: Array<{ matchId: number; kickoffAt: Date; result: FormResult; label: string }>;
};

const resultLabels: Record<FormResult, string> = {
  V: "Voitto",
  T: "Tasapeli",
  H: "Häviö",
};

/**
 * A `Vire` letter's title: `Voitto`, `Tasapeli`, `Häviö`.
 *
 * decisions/047-rivalry-page.md
 */
export function formResultLabel(result: FormResult): string {
  return resultLabels[result];
}

/**
 * One side's result, from its own goals. Called twice per match, with the
 * arguments swapped.
 *
 * decisions/001-premier-league-match-based-standings.md
 */
export function resultFor(goalsFor: number, goalsAgainst: number): FormResult {
  if (goalsFor > goalsAgainst) return "V";
  if (goalsFor < goalsAgainst) return "H";
  return "T";
}

function getOrCreateTeam(
  teams: Map<number, TeamTotals>,
  teamProviderId: number,
  teamName: string
): TeamTotals {
  const existing = teams.get(teamProviderId);
  if (existing) return existing;

  const created: TeamTotals = {
    teamProviderId,
    teamName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    results: [],
  };
  teams.set(teamProviderId, created);
  return created;
}

/**
 * The table from finished matches. `rosterMatches` seeds a zero-stats row for
 * every team in it, whatever the match status, and defaults to `matches`.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/008-winless-teams-in-standings.md
 */
export function calculateStandings(
  matches: NormalizedMatch[],
  rosterMatches: RosterMatch[] = matches
): TeamStanding[] {
  const teams = new Map<number, TeamTotals>();

  for (const rosterMatch of rosterMatches) {
    getOrCreateTeam(teams, rosterMatch.homeTeamProviderId, rosterMatch.homeTeamName);
    getOrCreateTeam(teams, rosterMatch.awayTeamProviderId, rosterMatch.awayTeamName);
  }

  for (const match of matches) {
    const home = getOrCreateTeam(teams, match.homeTeamProviderId, match.homeTeamName);
    const away = getOrCreateTeam(teams, match.awayTeamProviderId, match.awayTeamName);
    const homeResult = resultFor(match.homeGoals, match.awayGoals);
    const awayResult = resultFor(match.awayGoals, match.homeGoals);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    applyResult(home, homeResult, match.providerMatchId, match.kickoffAt);
    applyResult(away, awayResult, match.providerMatchId, match.kickoffAt);
  }

  return [...teams.values()]
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalsFor - right.goalsAgainst - (left.goalsFor - left.goalsAgainst) ||
        right.goalsFor - left.goalsFor ||
        left.teamName.localeCompare(right.teamName)
    )
    .map((team, index) => ({
      position: index + 1,
      teamProviderId: team.teamProviderId,
      teamName: team.teamName,
      played: team.played,
      won: team.won,
      drawn: team.drawn,
      lost: team.lost,
      goalsFor: team.goalsFor,
      goalsAgainst: team.goalsAgainst,
      goalDifference: team.goalsFor - team.goalsAgainst,
      points: team.points,
      // toSorted, not sort: `team.results` is the accumulator's own array,
      // not a filtered copy, so sorting in place would reorder it as a side
      // effect of reading the form.
      form: team.results
        .toSorted((left, right) => right.kickoffAt.getTime() - left.kickoffAt.getTime())
        .slice(0, 5)
        .reverse()
        .map(({ matchId, result, label }) => ({ matchId, result, label })),
    }));
}

/**
 * A team's matches within a season's full match list, chronological.
 *
 * decisions/009-veikkausliiga.md
 */
export function selectTeamMatches<
  T extends { homeTeamProviderId: number; awayTeamProviderId: number; kickoffAt: Date },
>(seasonMatches: T[], teamProviderId: number): T[] {
  return seasonMatches
    .filter(
      (match) =>
        match.homeTeamProviderId === teamProviderId || match.awayTeamProviderId === teamProviderId
    )
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());
}

function applyResult(team: TeamTotals, result: FormResult, matchId: number, kickoffAt: Date): void {
  team.results.push({ matchId, kickoffAt, result, label: formResultLabel(result) });
  if (result === "V") {
    team.won += 1;
    team.points += 3;
  } else if (result === "T") {
    team.drawn += 1;
    team.points += 1;
  } else {
    team.lost += 1;
  }
}
