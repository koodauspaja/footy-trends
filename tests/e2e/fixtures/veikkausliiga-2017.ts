/**
 * A Veikkausliiga season, seeded and not fetched: a knockout group without points
 * is a shape no live season produces. Stored rows of a completed season are never
 * refetched, so any database renders these. 2017, as nothing else asserts on it.
 *
 * decisions/304-test-database.md
 * decisions/036-halftime-comebacks.md
 */

export const SEASON = 2017;
export const CATEGORY_ID = "VL";
export const COMPETITION_ID = "spljp17";

/**
 * Group ids and the headings they render under.
 *
 * decisions/304-test-database.md
 */
export const GROUPS = {
  league: { id: 1, name: "Runkosarja" },
  /** A knockout: TASO reports no points for it, so it renders as its matches. */
  knockout: { id: 2, name: "Eurolopputurnaus" },
  /** Its two-legged final, the same shape with two teams. */
  final: { id: 3, name: "Eurolopputurnausfinaali" },
} as const;

/**
 * Ids well outside anything TASO uses, so a fixture can never collide with real
 * data.
 *
 * decisions/304-test-database.md
 */
const TEAM = {
  hjk: { id: 990_001, name: "Fixture HJK" },
  kups: { id: 990_002, name: "Fixture KuPS" },
  ilves: { id: 990_003, name: "Fixture Ilves" },
  inter: { id: 990_004, name: "Fixture Inter" },
} as const;

type MatchRow = {
  taso_match_id: number;
  group_id: number;
  group_name: string;
  kickoff_at: string;
  matchday: number | null;
  home: { id: number; name: string };
  away: { id: number; name: string };
  home_goals: number;
  away_goals: number;
  /** `null` for a match TASO gave no half-time score for. */
  half_time_home: number | null;
  half_time_away: number | null;
};

function match(
  id: number,
  group: { id: number; name: string },
  day: number,
  home: { id: number; name: string },
  away: { id: number; name: string },
  score: [number, number],
  matchday: number | null,
  halfTime: [number, number] | null = null
): MatchRow {
  return {
    taso_match_id: id,
    group_id: group.id,
    group_name: group.name,
    kickoff_at: `2017-0${day < 10 ? day : 9}-1${day % 10}T16:00:00Z`,
    matchday,
    home,
    away,
    home_goals: score[0],
    away_goals: score[1],
    half_time_home: halfTime?.[0] ?? null,
    half_time_away: halfTime?.[1] ?? null,
  };
}

/**
 * Six league matches, every pair once, so the table has four teams with different
 * points, and three knockout matches across two groups. The half-time scores are
 * chosen for the comebacks panel, and comebacks.spec.ts says what each club shows.
 *
 * decisions/304-test-database.md
 * decisions/036-halftime-comebacks.md
 */
export const MATCHES: MatchRow[] = [
  match(9_900_101, GROUPS.league, 1, TEAM.hjk, TEAM.kups, [2, 0], 1, [0, 1]),
  match(9_900_102, GROUPS.league, 2, TEAM.ilves, TEAM.inter, [1, 1], 1, [1, 0]),
  match(9_900_103, GROUPS.league, 3, TEAM.hjk, TEAM.ilves, [3, 1], 2, [1, 0]),
  match(9_900_104, GROUPS.league, 4, TEAM.kups, TEAM.inter, [2, 1], 2, [0, 1]),
  // No half-time score, as TASO gave none for 1 of Ykkönen 2025's 132 matches.
  match(9_900_105, GROUPS.league, 5, TEAM.hjk, TEAM.inter, [1, 0], 3),
  match(9_900_106, GROUPS.league, 6, TEAM.kups, TEAM.ilves, [0, 0], 3, [0, 1]),

  // The knockout: two semi-finals and a third-place match.
  match(9_900_201, GROUPS.knockout, 7, TEAM.hjk, TEAM.inter, [2, 1], null, [0, 1]),
  match(9_900_202, GROUPS.knockout, 7, TEAM.kups, TEAM.ilves, [1, 0], null, [1, 0]),
  match(9_900_203, GROUPS.knockout, 8, TEAM.inter, TEAM.ilves, [1, 2], null, [1, 0]),

  // The final, over two legs.
  match(9_900_301, GROUPS.final, 8, TEAM.hjk, TEAM.kups, [1, 0], null, [0, 0]),
  match(9_900_302, GROUPS.final, 9, TEAM.kups, TEAM.hjk, [1, 1], null, [0, 1]),
];

type TeamRow = {
  group_id: number;
  team: { id: number; name: string };
  points: number | null;
  matches_played: number;
  current_standing: number | null;
};

/**
 * The league group carries points; the knockout groups do not. That is the
 * whole rule `keepsATable` applies: a group whose rows have no points is not a
 * points competition, so the app shows its matches.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/304-test-database.md
 */
export const TEAM_ROWS: TeamRow[] = [
  { group_id: GROUPS.league.id, team: TEAM.hjk, points: 9, matches_played: 3, current_standing: 1 },
  {
    group_id: GROUPS.league.id,
    team: TEAM.kups,
    points: 4,
    matches_played: 3,
    current_standing: 2,
  },
  {
    group_id: GROUPS.league.id,
    team: TEAM.ilves,
    points: 2,
    matches_played: 3,
    current_standing: 3,
  },
  {
    group_id: GROUPS.league.id,
    team: TEAM.inter,
    points: 1,
    matches_played: 3,
    current_standing: 4,
  },

  {
    group_id: GROUPS.knockout.id,
    team: TEAM.hjk,
    points: null,
    matches_played: 1,
    current_standing: null,
  },
  {
    group_id: GROUPS.knockout.id,
    team: TEAM.kups,
    points: null,
    matches_played: 1,
    current_standing: null,
  },
  {
    group_id: GROUPS.knockout.id,
    team: TEAM.ilves,
    points: null,
    matches_played: 2,
    current_standing: null,
  },
  {
    group_id: GROUPS.knockout.id,
    team: TEAM.inter,
    points: null,
    matches_played: 2,
    current_standing: null,
  },

  {
    group_id: GROUPS.final.id,
    team: TEAM.hjk,
    points: null,
    matches_played: 2,
    current_standing: null,
  },
  {
    group_id: GROUPS.final.id,
    team: TEAM.kups,
    points: null,
    matches_played: 2,
    current_standing: null,
  },
];
