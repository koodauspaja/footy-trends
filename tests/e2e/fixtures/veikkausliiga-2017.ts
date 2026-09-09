/**
 * A Veikkausliiga season, seeded rather than fetched — from #304.
 *
 * **Why a fixture and not a real season.** These assertions are about *how a
 * group renders*, and that depends on a shape TASO no longer produces. Before
 * #272 the app read `getGroups`, which omitted `points` for a knockout group and
 * returned one row per bracket slot; `keepsATable` saw no points and rendered
 * the group as a match list. `getCategory`, which #272 moved to because TASO had
 * started refusing `getGroups`, sends points for those groups — so every real
 * season now renders them as tables, and the match-list path has no live data
 * left to exercise it.
 *
 * Seeding it keeps that path covered for good, and costs **no provider request
 * at all**: a completed season with stored rows is never refetched, so the page
 * renders from exactly these rows on any database, empty or not.
 *
 * 2017 is chosen because nothing else in the suite asserts on it.
 */

export const SEASON = 2017;
export const CATEGORY_ID = "VL";
export const COMPETITION_ID = "spljp17";

/** Group ids and the headings they render under. */
export const GROUPS = {
  league: { id: 1, name: "Runkosarja" },
  /** A knockout: TASO reports no points for it, so it renders as its matches. */
  knockout: { id: 2, name: "Eurolopputurnaus" },
  /** Its two-legged final, the same shape with two teams. */
  final: { id: 3, name: "Eurolopputurnausfinaali" },
} as const;

/** Ids well outside anything TASO uses, so a fixture can never collide with real data. */
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
};

function match(
  id: number,
  group: { id: number; name: string },
  day: number,
  home: { id: number; name: string },
  away: { id: number; name: string },
  score: [number, number],
  matchday: number | null
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
  };
}

/**
 * Six league matches — every pair once — so the table has four teams with
 * genuinely different points, and three knockout matches across two groups.
 */
export const MATCHES: MatchRow[] = [
  match(9_900_101, GROUPS.league, 1, TEAM.hjk, TEAM.kups, [2, 0], 1),
  match(9_900_102, GROUPS.league, 2, TEAM.ilves, TEAM.inter, [1, 1], 1),
  match(9_900_103, GROUPS.league, 3, TEAM.hjk, TEAM.ilves, [3, 1], 2),
  match(9_900_104, GROUPS.league, 4, TEAM.kups, TEAM.inter, [2, 1], 2),
  match(9_900_105, GROUPS.league, 5, TEAM.hjk, TEAM.inter, [1, 0], 3),
  match(9_900_106, GROUPS.league, 6, TEAM.kups, TEAM.ilves, [0, 0], 3),

  // The knockout: two semi-finals and a third-place match.
  match(9_900_201, GROUPS.knockout, 7, TEAM.hjk, TEAM.inter, [2, 1], null),
  match(9_900_202, GROUPS.knockout, 7, TEAM.kups, TEAM.ilves, [1, 0], null),
  match(9_900_203, GROUPS.knockout, 8, TEAM.inter, TEAM.ilves, [1, 2], null),

  // The final, over two legs.
  match(9_900_301, GROUPS.final, 8, TEAM.hjk, TEAM.kups, [1, 0], null),
  match(9_900_302, GROUPS.final, 9, TEAM.kups, TEAM.hjk, [1, 1], null),
];

type TeamRow = {
  group_id: number;
  team: { id: number; name: string };
  points: number | null;
  matches_played: number;
  current_standing: number | null;
};

/**
 * The league group carries points; the knockout groups do not.
 *
 * That is the whole rule `keepsATable` applies, and the reason it is worth
 * fixing in place: a group whose rows have no points is not a points
 * competition, so the app shows its matches instead of a meaningless table.
 *
 * **No repeated team here, and that is a finding rather than an omission.**
 * specs/010-playoff-group-match-list.md was written against TASO returning one
 * row per bracket slot, so an advancing team repeated and produced duplicate
 * React keys. `taso_group_teams` has a unique index on
 * `(category, competition, season, group, team_provider_id)`, so that state
 * cannot be stored at all — the schema already prevents it, whatever TASO
 * sends. What remains, and what this fixture covers, is the classification
 * rule: a group whose rows carry no points is not a points competition.
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
