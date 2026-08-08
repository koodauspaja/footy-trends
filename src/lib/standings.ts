export type NormalizedMatch = {
  providerMatchId: number;
  competitionCode: string;
  seasonId: number;
  kickoffAt: Date;
  matchday: number | null;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
};

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

function createTeam(teamProviderId: number, teamName: string): TeamTotals {
  return {
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
}

export function calculateStandings(matches: NormalizedMatch[]): TeamStanding[] {
  const teams = new Map<number, TeamTotals>();

  for (const match of matches) {
    const home =
      teams.get(match.homeTeamProviderId) ??
      createTeam(match.homeTeamProviderId, match.homeTeamName);
    const away =
      teams.get(match.awayTeamProviderId) ??
      createTeam(match.awayTeamProviderId, match.awayTeamName);
    const homeResult: FormResult =
      match.homeGoals > match.awayGoals ? "V" : match.homeGoals < match.awayGoals ? "H" : "T";
    const awayResult: FormResult = homeResult === "V" ? "H" : homeResult === "H" ? "V" : "T";

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    applyResult(home, homeResult, match.providerMatchId, match.kickoffAt);
    applyResult(away, awayResult, match.providerMatchId, match.kickoffAt);
    teams.set(home.teamProviderId, home);
    teams.set(away.teamProviderId, away);
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
      form: team.results
        .sort((left, right) => right.kickoffAt.getTime() - left.kickoffAt.getTime())
        .slice(0, 5)
        .reverse()
        .map(({ matchId, result, label }) => ({ matchId, result, label })),
    }));
}

function applyResult(team: TeamTotals, result: FormResult, matchId: number, kickoffAt: Date): void {
  team.results.push({ matchId, kickoffAt, result, label: resultLabels[result] });
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
