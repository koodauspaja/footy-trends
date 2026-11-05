/**
 * `Arvauspeli`'s rules for guessing a season as a whole: the four kinds, what
 * each costs and pays, the shape a guess must have, and how a finished season
 * judges it.
 *
 * decisions/075-season-guesses.md
 */

/**
 * The four kinds of season guess, in the order the page shows them.
 *
 * decisions/075-season-guesses.md
 */
export const SEASON_KINDS = ["champion", "upper", "last", "table"] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];

/**
 * What a guess of each kind costs, paid once, and how many teams it names.
 *
 * decisions/075-season-guesses.md
 */
export const SEASON_PRICES: Readonly<Record<SeasonKind, number>> = {
  champion: 50,
  upper: 50,
  last: 50,
  table: 100,
};
export const SEASON_TEAM_COUNTS: Readonly<Record<SeasonKind, number>> = {
  champion: 1,
  upper: 6,
  last: 1,
  table: 12,
};

/**
 * The rewards: a right champion or last place, each team right in the six, and
 * each team of the table in its exact place or one place off.
 *
 * decisions/075-season-guesses.md
 */
export const SEASON_REWARDS = {
  champion: 200,
  last: 200,
  upperTeam: 15,
  tableExact: 30,
  tableNear: 10,
} as const;

/** The place a last-place guess names. */
export const LAST_PLACE = 12;

/**
 * A season guess: its kind and the TASO team ids it names, in order; the
 * table's first team is its guess for 1st place.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonGuess = { kind: SeasonKind; teams: number[] };

function isSeasonKind(value: unknown): value is SeasonKind {
  return typeof value === "string" && (SEASON_KINDS as readonly string[]).includes(value);
}

/**
 * A season guess from the browser, or `null` unless it is one: a known kind,
 * and as many distinct teams of the season as the kind names.
 *
 * decisions/075-season-guesses.md
 */
export function parseSeasonGuess(
  input: unknown,
  seasonTeams: ReadonlySet<number>
): SeasonGuess | null {
  if (typeof input !== "object" || input === null) return null;
  const { kind, teams } = input as { kind?: unknown; teams?: unknown };
  if (!isSeasonKind(kind) || !Array.isArray(teams)) return null;
  if (teams.length !== SEASON_TEAM_COUNTS[kind]) return null;
  if (!teams.every((team) => typeof team === "number" && seasonTeams.has(team))) return null;
  if (new Set(teams).size !== teams.length) return null;
  return { kind, teams: [...teams] };
}

/**
 * Whether two guesses of a kind name the same teams; the six in any order,
 * every other kind in its own.
 *
 * decisions/075-season-guesses.md
 */
export function sameSeasonGuess(left: SeasonGuess, right: SeasonGuess): boolean {
  if (left.kind !== right.kind || left.teams.length !== right.teams.length) return false;
  if (left.kind === "upper") return left.teams.every((team) => right.teams.includes(team));
  return left.teams.every((team, index) => right.teams[index] === team);
}

/**
 * A table's rows as the standings page orders them: each team's position.
 *
 * decisions/075-season-guesses.md
 */
export type TableRow = { position: number; teamProviderId: number };

/**
 * The regular season's top six, by its table: the teams that reach
 * `Mestaruussarja`.
 *
 * decisions/075-season-guesses.md
 */
export function upperSix(regularSeason: readonly TableRow[]): Set<number> {
  return new Set(regularSeason.filter((row) => row.position <= 6).map((row) => row.teamProviderId));
}

/**
 * Each team's final place: its place in `Mestaruussarja`, or 6 + its place in
 * `Karsintasarja`.
 *
 * decisions/075-season-guesses.md
 */
export function finalPlaces(
  upper: readonly TableRow[],
  lower: readonly TableRow[]
): Map<number, number> {
  return new Map([
    ...upper.map((row) => [row.teamProviderId, row.position] as const),
    ...lower.map((row) => [row.teamProviderId, 6 + row.position] as const),
  ]);
}

/**
 * What a season guess paid, and the counts behind it: teams right, and for a
 * table the teams one place off.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonJudgement = { reward: number; right: number; near: number };

/**
 * Judges a guess of the six by the teams that reached `Mestaruussarja`.
 *
 * decisions/075-season-guesses.md
 */
export function judgeUpper(teams: readonly number[], upper: ReadonlySet<number>): SeasonJudgement {
  const right = teams.filter((team) => upper.has(team)).length;
  return { reward: right * SEASON_REWARDS.upperTeam, right, near: 0 };
}

/**
 * Judges a champion, last-place or table guess by the final places. A team
 * with no final place, one that withdrew, misses.
 *
 * decisions/075-season-guesses.md
 */
export function judgeByPlaces(
  guess: SeasonGuess & { kind: Exclude<SeasonKind, "upper"> },
  places: ReadonlyMap<number, number>
): SeasonJudgement {
  if (guess.kind === "table") {
    const offs = guess.teams.map((team, index) => {
      const place = places.get(team);
      return place === undefined ? null : Math.abs(place - (index + 1));
    });
    const right = offs.filter((off) => off === 0).length;
    const near = offs.filter((off) => off === 1).length;
    return {
      reward: right * SEASON_REWARDS.tableExact + near * SEASON_REWARDS.tableNear,
      right,
      near,
    };
  }
  const wanted = guess.kind === "champion" ? 1 : LAST_PLACE;
  const right = guess.teams.filter((team) => places.get(team) === wanted).length;
  return { reward: right * SEASON_REWARDS[guess.kind], right, near: 0 };
}
