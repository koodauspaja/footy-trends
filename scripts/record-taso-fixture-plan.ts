import type { TasoCompetition, TasoGroup, TasoGroupTeam, TasoProviderMatch } from "../src/lib/taso";

/**
 * Turns stored TASO rows back into the answers TASO gave for them, for the e2e
 * suite's stand-in to replay. Free of the database and of `process`, so it is
 * unit tested directly; `record-taso-fixture.ts` reads the rows and writes the file.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */

/** One `taso_matches` row, as the recorder selects it. */
export type StoredMatch = {
  competitionId: string;
  categoryId: string;
  seasonId: number;
  tasoMatchId: number;
  groupId: number;
  groupName: string;
  kickoffAt: Date;
  matchday: number | null;
  status: string;
  winner: string | null;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
};

/** One `taso_group_teams` row, as the recorder selects it. */
export type StoredGroupTeam = {
  competitionId: string;
  categoryId: string;
  seasonId: number;
  groupId: number;
  teamProviderId: number;
  teamName: string;
  startingPoints: number | null;
  points: number | null;
  matchesPlayed: number | null;
  matchesWon: number | null;
  matchesTied: number | null;
  matchesLost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalsDiff: number | null;
  currentStanding: number | null;
  finalGroupStanding: number | null;
};

/** One `taso_group_zones` row, as the recorder selects it. */
export type StoredZone = {
  competitionId: string;
  categoryId: string;
  seasonId: number;
  groupId: number;
  level: number;
  teamCount: number;
  label: string | null;
};

type ByCategory<T> = Record<string, Record<string, T>>;

/**
 * What the stand-in replays: `getCompetitions`, and per competition id
 * `getCategories`, `getMatches` and `getCategory`.
 */
export type RecordedFixture = {
  competitions: TasoCompetition[];
  categories: ByCategory<string>;
  matches: ByCategory<TasoProviderMatch[]>;
  groups: ByCategory<TasoGroup[]>;
};

/** Which rows are recorded: no national-team bucket, and nothing the suite seeds itself. */
export type Selection = {
  earliestSeason: number;
  latestSeason: number;
  seeded: { competitionId: string; categoryId: string; seasonId: number };
};

type Row = { competitionId: string; categoryId: string; seasonId: number };

/**
 * Whether a row belongs in the recording. A season outside the real range is an
 * integration test's leftover, and the national-team buckets have their own fixture.
 */
export function isRecorded(row: Row, selection: Selection): boolean {
  const { seeded } = selection;
  if (row.competitionId.startsWith("maajp")) return false;
  if (row.seasonId < selection.earliestSeason || row.seasonId > selection.latestSeason) {
    return false;
  }
  return !(
    row.competitionId === seeded.competitionId &&
    row.categoryId === seeded.categoryId &&
    row.seasonId === seeded.seasonId
  );
}

/** Where the e2e specs' own match ids start, far above any TASO uses. */
const FIRST_SYNTHETIC_MATCH_ID = 999_000_000;

/**
 * Whether a stored match came from TASO, not from an e2e spec that seeded it
 * and has not yet removed it.
 */
export function isProviderMatch(row: Pick<StoredMatch, "tasoMatchId">): boolean {
  return row.tasoMatchId < FIRST_SYNTHETIC_MATCH_ID;
}

const STATUS = new Map([
  ["FINISHED", "Played"],
  ["SCHEDULED", "Fixture"],
]);
const WINNER = new Map([
  ["home", "Home"],
  ["away", "Away"],
  ["tie", "Tie"],
]);

function text(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * A stored match as TASO sent it. The kickoff goes out in UTC with a `+0000`
 * offset, which `normalizeTasoMatch` reads back to the same instant.
 */
export function toProviderMatch(row: StoredMatch): TasoProviderMatch {
  const iso = row.kickoffAt.toISOString();
  const winner = row.winner === null ? undefined : WINNER.get(row.winner);
  return {
    match_id: String(row.tasoMatchId),
    status: STATUS.get(row.status) ?? row.status,
    ...(winner === undefined ? {} : { winner }),
    ...(row.matchday === null ? {} : { round_id: String(row.matchday) }),
    group_id: String(row.groupId),
    group_name: row.groupName,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
    time_zone_offset: "+0000",
    team_A_id: String(row.homeTeamProviderId),
    team_A_name: row.homeTeamName,
    team_B_id: String(row.awayTeamProviderId),
    team_B_name: row.awayTeamName,
    fs_A: text(row.homeGoals),
    fs_B: text(row.awayGoals),
    hts_A: text(row.halfTimeHome),
    hts_B: text(row.halfTimeAway),
  };
}

function toProviderTeam(row: StoredGroupTeam): TasoGroupTeam {
  return {
    team_id: String(row.teamProviderId),
    team_name: row.teamName,
    matches_played: row.matchesPlayed,
    matches_won: row.matchesWon,
    matches_tied: row.matchesTied,
    matches_lost: row.matchesLost,
    goals_for: row.goalsFor,
    goals_against: row.goalsAgainst,
    goals_diff: row.goalsDiff,
    points: row.points,
    starting_points: row.startingPoints,
    current_standing: row.currentStanding,
    final_group_standing: row.finalGroupStanding === null ? null : String(row.finalGroupStanding),
  };
}

const LEVELS_PER_GROUP = 10;

/**
 * One category's groups as `getCategory` sent them: every group with a team row
 * or a zone, its teams in the order given, and its zones as the ten counts and
 * labels `normalizeGroupLevels` reads. A group's name comes from its matches when
 * it has any.
 */
export function toProviderGroups(
  teams: StoredGroupTeam[],
  zones: StoredZone[],
  groupNames: Map<number, string>
): TasoGroup[] {
  const groupIds = [...new Set([...teams, ...zones].map((row) => row.groupId))].sort(
    (a, b) => a - b
  );
  return groupIds.map((groupId) => {
    const name = groupNames.get(groupId);
    const levels = zones.filter((zone) => zone.groupId === groupId);
    const counts = new Array<number>(LEVELS_PER_GROUP).fill(0);
    const labels = new Array<string>(LEVELS_PER_GROUP).fill("");
    for (const zone of levels) {
      if (zone.level < 1 || zone.level > LEVELS_PER_GROUP) {
        throw new Error(
          `Zone level ${zone.level} of group ${groupId} is outside 1 to ${LEVELS_PER_GROUP}`
        );
      }
      counts[zone.level - 1] = zone.teamCount;
      labels[zone.level - 1] = zone.label ?? "";
    }
    return {
      group_id: String(groupId),
      ...(name === undefined ? {} : { group_name: name }),
      ...(levels.length === 0
        ? {}
        : { next_stage_levels: counts.join(","), next_stage_level_texts: labels }),
      // In the order given, which is TASO's: the page keeps it for teams that
      // share a standing, or have none.
      teams: teams.filter((team) => team.groupId === groupId).map(toProviderTeam),
    };
  });
}

/** A competition and category as one key, however either id is spelled. */
function key(row: Row): string {
  return JSON.stringify([row.competitionId, row.categoryId]);
}

function groupBy<T extends Row>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(key(row));
    if (list === undefined) grouped.set(key(row), [row]);
    else list.push(row);
  }
  return grouped;
}

/** A season of Finnish football as a whole, which `getCompetitions` lists. */
const SEASON_COMPETITION_ID = /^spljp\d{2}$/;

/**
 * The fixture for the rows given, already selected. A category's matches are
 * recorded when it has stored matches, and its groups when it has stored group
 * rows or zones: nothing shows TASO answered the rest with an empty list. Throws
 * on no matches at all, and on a competition id spanning two seasons, which the
 * stand-in, keyed by competition and category, could not replay.
 */
export function buildFixture(input: {
  matches: StoredMatch[];
  groupTeams: StoredGroupTeam[];
  zones: StoredZone[];
  categoryNames: Record<string, Record<string, string>>;
}): RecordedFixture {
  const seasons = seasonOfEachCompetition([...input.matches, ...input.groupTeams, ...input.zones]);
  if (input.matches.length === 0) {
    throw new Error("No matches to record; the fixture is left as it is");
  }

  const matches = groupBy(input.matches);
  const teams = groupBy(input.groupTeams);
  const zones = groupBy(input.zones);
  const recorded = [...new Set([...matches.keys(), ...teams.keys(), ...zones.keys()])].sort(
    (a, b) => a.localeCompare(b)
  );

  const matchLists = new Map<string, Map<string, TasoProviderMatch[]>>();
  const groupLists = new Map<string, Map<string, TasoGroup[]>>();
  for (const pair of recorded) {
    const [competitionId, categoryId] = JSON.parse(pair) as [string, string];
    const categoryMatches = (matches.get(pair) ?? []).toSorted(
      (a, b) => a.tasoMatchId - b.tasoMatchId
    );
    if (categoryMatches.length > 0) {
      put(matchLists, competitionId, categoryId, categoryMatches.map(toProviderMatch));
    }
    if (teams.has(pair) || zones.has(pair)) {
      const groupNames = new Map(categoryMatches.map((row) => [row.groupId, row.groupName]));
      put(
        groupLists,
        competitionId,
        categoryId,
        toProviderGroups(teams.get(pair) ?? [], zones.get(pair) ?? [], groupNames)
      );
    }
  }

  const ordered = [...seasons].sort(([a], [b]) => a.localeCompare(b));
  return {
    competitions: ordered
      .filter(([competitionId]) => SEASON_COMPETITION_ID.test(competitionId))
      .map(([competitionId, seasonId]) => ({
        competition_id: competitionId,
        competition_status: "published",
        season_id: String(seasonId),
      })),
    // Built from entries, so every id is an own key, `__proto__` included.
    categories: Object.fromEntries(
      Object.entries(input.categoryNames)
        .filter(([competitionId]) => seasons.has(competitionId))
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    matches: toRecord(matchLists),
    groups: toRecord(groupLists),
  };
}

/**
 * The category names one Redis entry holds, as `getSeasonCategoryName` cached
 * them: a JSON object of names. Anything else throws, naming the entry, rather
 * than reaching the fixture as names.
 */
export function parseCategoryNames(key: string, raw: string): Record<string, string> {
  const refusal = `${key} in Redis is not a map of category names`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(refusal, { cause: error });
  }
  const isNames =
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    Object.values(parsed).every((name) => typeof name === "string");
  if (!isNames) throw new Error(refusal);
  return parsed as Record<string, string>;
}

/** Each competition id's one season, or a throw naming the competition that holds two. */
function seasonOfEachCompetition(rows: Row[]): Map<string, number> {
  const seasons = new Map<string, number>();
  for (const row of rows) {
    const known = seasons.get(row.competitionId);
    if (known !== undefined && known !== row.seasonId) {
      throw new Error(
        `${row.competitionId} holds seasons ${known} and ${row.seasonId}; the stand-in replays one`
      );
    }
    seasons.set(row.competitionId, row.seasonId);
  }
  return seasons;
}

function put<T>(
  lists: Map<string, Map<string, T>>,
  competitionId: string,
  categoryId: string,
  value: T
) {
  const categories = lists.get(competitionId) ?? new Map<string, T>();
  categories.set(categoryId, value);
  lists.set(competitionId, categories);
}

function toRecord<T>(lists: Map<string, Map<string, T>>): ByCategory<T> {
  return Object.fromEntries(
    [...lists].map(([competitionId, categories]) => [competitionId, Object.fromEntries(categories)])
  );
}
