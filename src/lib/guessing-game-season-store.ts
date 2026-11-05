import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameLedger, gamePlayer, gameSeasonGuess, tasoMatches } from "@/db/schema";
import { categoryIdForSeason, competitionIdForSeason } from "./domestic-competitions";
import {
  finalPlaces,
  judgeByPlaces,
  judgeUpper,
  parseSeasonGuess,
  SEASON_PRICES,
  type SeasonJudgement,
  type SeasonKind,
  sameSeasonGuess,
  type TableRow,
  upperSix,
} from "./guessing-game-season";
import {
  balanceOf,
  type Client,
  COMPETITION,
  ensureGrant,
  FINISHED,
  type GameView,
  latestSeason,
  REGULAR_SEASON_GROUP,
  type SeasonMatch,
  seasonOf,
  seasonOfId,
} from "./guessing-game-store";
import { logger } from "./logger";
import { getSeasonStandings } from "./taso-standings-service";

/**
 * `Arvauspeli`'s season guesses: placing and changing one before the lock, the
 * section's read, and settling once the season has answered. What any of it
 * decides is in `guessing-game-season.ts`.
 *
 * decisions/075-season-guesses.md
 */

/** The groups the split makes of the regular season: the upper and the lower. */
const UPPER_GROUP = 2;
const LOWER_GROUP = 3;
/** Shares of the picks are shown from this many guesses, as specs/073's are. */
const MIN_SHARED = 3;
/** The teams a share line names before the rest are `muut`. */
const SHARED_TEAMS = 3;

/**
 * Why a season guess was not stored.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonGuessRefusal = "not-joined" | "no-season" | "locked" | "teams" | "insufficient";

export type SeasonGuessOutcome =
  | { ok: true; outcome: "placed" | "changed" | "unchanged" }
  | { ok: false; reason: SeasonGuessRefusal };

/**
 * The regular season's teams, by TASO id, with their names.
 *
 * decisions/075-season-guesses.md
 */
async function seasonTeams(client: Client, seasonId: number): Promise<Map<number, string>> {
  const rows = await client
    .select({
      homeId: tasoMatches.homeTeamProviderId,
      homeName: tasoMatches.homeTeamName,
      awayId: tasoMatches.awayTeamProviderId,
      awayName: tasoMatches.awayTeamName,
    })
    .from(tasoMatches)
    .where(and(seasonOf(seasonId), eq(tasoMatches.groupId, REGULAR_SEASON_GROUP)));
  const teams = new Map<number, string>();
  for (const row of rows) {
    teams.set(row.homeId, row.homeName);
    teams.set(row.awayId, row.awayName);
  }
  return teams;
}

/**
 * The lock: the season's first stored kickoff, or `null` with nothing stored.
 *
 * decisions/075-season-guesses.md
 */
function lockOf(matches: readonly SeasonMatch[]): Date | null {
  return matches[0]?.kickoffAt ?? null;
}

function refused(
  userId: string,
  seasonId: number | null,
  kind: unknown,
  reason: SeasonGuessRefusal
): SeasonGuessOutcome {
  logger.info(
    { userId, seasonId, kind: typeof kind === "string" ? kind.slice(0, 20) : null, reason },
    "Arvauspeli season guess refused"
  );
  return { ok: false, reason };
}

/**
 * Places or changes the player's season guess of one kind, in one transaction
 * with the player locked, as a match guess is. A first placement pays its
 * price; a change before the lock is free.
 *
 * decisions/075-season-guesses.md
 */
export async function placeSeasonGuess(
  userId: string,
  input: unknown,
  clock: () => Date
): Promise<SeasonGuessOutcome> {
  const kind = (input as { kind?: unknown } | null)?.kind;
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ joinedAt: gamePlayer.joinedAt })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, userId))
      .for("update");
    if (player === undefined) return refused(userId, null, kind, "not-joined");
    const now = clock();
    const seasonId = await latestSeason(tx);
    if (seasonId === null) return refused(userId, null, kind, "no-season");
    const season = await seasonOfId(tx, seasonId);
    const lock = lockOf(season.matches);
    if (lock === null) return refused(userId, seasonId, kind, "no-season");
    if (now >= lock) return refused(userId, seasonId, kind, "locked");
    const guess = parseSeasonGuess(input, new Set((await seasonTeams(tx, seasonId)).keys()));
    if (guess === null) return refused(userId, seasonId, kind, "teams");

    await ensureGrant(tx, userId, season, player.joinedAt);
    const [existing] = await tx
      .select({ id: gameSeasonGuess.id, teams: gameSeasonGuess.teams })
      .from(gameSeasonGuess)
      .where(
        and(
          eq(gameSeasonGuess.userId, userId),
          eq(gameSeasonGuess.seasonId, seasonId),
          eq(gameSeasonGuess.kind, guess.kind)
        )
      );
    if (existing !== undefined) {
      if (sameSeasonGuess(guess, { kind: guess.kind, teams: existing.teams })) {
        return { ok: true, outcome: "unchanged" };
      }
      await tx
        .update(gameSeasonGuess)
        .set({ teams: guess.teams, madeAt: now })
        .where(eq(gameSeasonGuess.id, existing.id));
      logger.info(
        { userId, seasonId, kind: guess.kind, price: 0 },
        "Arvauspeli season guess changed"
      );
      return { ok: true, outcome: "changed" };
    }

    const price = SEASON_PRICES[guess.kind];
    if ((await balanceOf(tx, userId, seasonId)) < price) {
      return refused(userId, seasonId, guess.kind, "insufficient");
    }
    const [row] = await tx
      .insert(gameSeasonGuess)
      .values({ userId, seasonId, kind: guess.kind, teams: guess.teams, madeAt: now })
      .returning({ id: gameSeasonGuess.id });
    await tx.insert(gameLedger).values({
      userId,
      seasonId,
      kind: "season-guess",
      amount: -price,
      seasonGuessId: row?.id,
    });
    logger.info({ userId, seasonId, kind: guess.kind, price }, "Arvauspeli season guess placed");
    return { ok: true, outcome: "placed" };
  });
}

/**
 * A player's season guess of one kind as the section shows it: the teams, and
 * once settled what it paid, `void` for a guess refunded.
 *
 * decisions/075-season-guesses.md
 */
export type ShownSeasonGuess = {
  teams: number[];
  settled: (SeasonJudgement & { kind: "paid" }) | { kind: "void" } | null;
};

/**
 * One team's share of the players' picks, or the rest as `null`.
 *
 * decisions/075-season-guesses.md
 */
export type PickShare = { teamProviderId: number | null; percent: number };
export type PickShares = { shares: PickShare[]; total: number };

/**
 * What `Kauden arvaukset` shows a player for one season.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonSection = {
  seasonId: number;
  lockAt: Date;
  locked: boolean;
  /** The regular season's teams, by name in Finnish order. */
  teams: Array<{ teamProviderId: number; name: string }>;
  guesses: Partial<Record<SeasonKind, ShownSeasonGuess>>;
  /** After the lock, the players' champion and last-place picks; `null` from fewer than 3. */
  shares: { champion: PickShares | null; last: PickShares | null } | null;
};

function shownOf(row: typeof gameSeasonGuess.$inferSelect): ShownSeasonGuess {
  if (row.settledAt === null) return { teams: row.teams, settled: null };
  if (row.reward === null) return { teams: row.teams, settled: { kind: "void" } };
  return {
    teams: row.teams,
    settled: {
      kind: "paid",
      reward: row.reward,
      right: row.rightCount ?? 0,
      near: row.nearCount ?? 0,
    },
  };
}

/**
 * The share line of one kind's picks: the most picked teams, then the rest.
 *
 * decisions/075-season-guesses.md
 */
export function pickSharesOf(counts: ReadonlyMap<number, number>): PickShares | null {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total < MIN_SHARED) return null;
  const ranked = [...counts].sort(([leftTeam, left], [rightTeam, right]) =>
    right === left ? leftTeam - rightTeam : right - left
  );
  const named = ranked.slice(0, SHARED_TEAMS);
  const rest = ranked.slice(SHARED_TEAMS).reduce((sum, [, count]) => sum + count, 0);
  const percent = (count: number) => Math.round((100 * count) / total);
  const shares: PickShare[] = named.map(([teamProviderId, count]) => ({
    teamProviderId,
    percent: percent(count),
  }));
  if (rest > 0) shares.push({ teamProviderId: null, percent: percent(rest) });
  return { shares, total };
}

async function pickShares(
  client: Client,
  seasonId: number,
  kind: "champion" | "last"
): Promise<PickShares | null> {
  const rows = await client
    .select({
      team: sql<number>`${gameSeasonGuess.teams}[1]`.mapWith(Number),
      count: sql<number>`count(*)::int`,
    })
    .from(gameSeasonGuess)
    .where(and(eq(gameSeasonGuess.seasonId, seasonId), eq(gameSeasonGuess.kind, kind)))
    .groupBy(sql`${gameSeasonGuess.teams}[1]`);
  return pickSharesOf(new Map(rows.map((row) => [row.team, row.count])));
}

/**
 * The section for one season, or `null` when there is none to show: nothing
 * stored, or locked with no guess of the player's.
 *
 * decisions/075-season-guesses.md
 */
export async function readSeasonSection(
  userId: string,
  seasonId: number,
  now: Date
): Promise<SeasonSection | null> {
  return db.transaction(
    async (tx) => {
      const matches = await tx
        .select({ kickoffAt: tasoMatches.kickoffAt })
        .from(tasoMatches)
        .where(seasonOf(seasonId))
        .orderBy(asc(tasoMatches.kickoffAt))
        .limit(1);
      const lockAt = matches[0]?.kickoffAt;
      if (lockAt === undefined) return null;
      const locked = now >= lockAt;
      const rows = await tx
        .select()
        .from(gameSeasonGuess)
        .where(and(eq(gameSeasonGuess.userId, userId), eq(gameSeasonGuess.seasonId, seasonId)));
      if (locked && rows.length === 0) return null;
      const [teams, champion, last] = await Promise.all([
        seasonTeams(tx, seasonId),
        locked ? pickShares(tx, seasonId, "champion") : null,
        locked ? pickShares(tx, seasonId, "last") : null,
      ]);
      return {
        seasonId,
        lockAt,
        locked,
        teams: [...teams]
          .map(([teamProviderId, name]) => ({ teamProviderId, name }))
          .sort((left, right) => left.name.localeCompare(right.name, "fi")),
        guesses: Object.fromEntries(rows.map((row) => [row.kind, shownOf(row)])),
        shares: locked ? { champion, last } : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

/**
 * The section for the season a view is about: the one in play, or between
 * seasons the one just finished, which shows only its guesses' results. A
 * failed read logs and leaves the section out, not the game.
 *
 * decisions/075-season-guesses.md
 */
export async function readSeasonSectionOf(
  view: GameView,
  userId: string,
  now: Date
): Promise<SeasonSection | null> {
  let seasonId: number | null = null;
  if (view.kind === "playing") seasonId = view.seasonId;
  else if (view.kind === "between" && view.joined) seasonId = view.nextSeasonId - 1;
  if (seasonId === null) return null;
  try {
    return await readSeasonSection(userId, seasonId, now);
  } catch (error) {
    logger.error({ err: error, userId }, "Reading Arvauspeli season guesses failed");
    return null;
  }
}

/**
 * The season's answers so far: the six once the regular season is played, the
 * final places once both groups are. Read from the tables the standings page
 * shows, ours or TASO's own.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonAnswers = {
  upper: Set<number> | null;
  places: Map<number, number> | null;
};

/**
 * Whether every stored match of a group has been played: a group with none
 * stored has not.
 *
 * decisions/075-season-guesses.md
 */
function groupPlayed(matches: readonly SeasonMatch[], groupId: number): boolean {
  const group = matches.filter((match) => match.groupId === groupId);
  return group.length > 0 && group.every((match) => match.status === FINISHED);
}

/**
 * Reads the answers of a season whose stored matches say one is due; a group
 * not stored or shown as a match list gives none. A failed read throws.
 *
 * decisions/075-season-guesses.md
 */
export async function readSeasonAnswers(
  seasonId: number,
  activeSeasonId: number,
  matches: readonly SeasonMatch[]
): Promise<SeasonAnswers> {
  const regularPlayed = groupPlayed(matches, REGULAR_SEASON_GROUP);
  const splitPlayed = groupPlayed(matches, UPPER_GROUP) && groupPlayed(matches, LOWER_GROUP);
  if (!regularPlayed && !splitPlayed) return { upper: null, places: null };
  const result = await getSeasonStandings(
    categoryIdForSeason(COMPETITION, seasonId),
    competitionIdForSeason(COMPETITION, seasonId),
    seasonId,
    activeSeasonId,
    undefined
  );
  if (result.status === "error") throw new Error(`Season ${seasonId}'s tables could not be read`);
  const rows = (groupId: number): TableRow[] | null => {
    const group = result.groups.find((candidate) => candidate.groupId === groupId);
    return group === undefined || group.kind === "match-list" ? null : group.standings;
  };
  const regular = regularPlayed ? rows(REGULAR_SEASON_GROUP) : null;
  const upper = splitPlayed ? rows(UPPER_GROUP) : null;
  const lower = splitPlayed ? rows(LOWER_GROUP) : null;
  return {
    upper: regular === null ? null : upperSix(regular),
    places: upper === null || lower === null ? null : finalPlaces(upper, lower),
  };
}

/**
 * What the run did with the season guesses.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonSettleReport = {
  settled: number;
  /** Settled guesses that paid more than 0. */
  rewarded: number;
  voided: number;
  /** Season guess ids that could not be settled this run. */
  failed: number[];
};

type OpenSeasonGuess = { id: number; seasonId: number; kind: string; teams: number[] };

/**
 * Settles one guess in its own transaction, the row locked and still open, so
 * a racing run settles nothing twice: by its judgement, or `void` with the
 * price refunded. `false` when another run settled it first.
 *
 * decisions/075-season-guesses.md
 */
async function settleOne(
  guess: OpenSeasonGuess,
  judgement: SeasonJudgement | "void",
  now: Date
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ userId: gameSeasonGuess.userId })
      .from(gameSeasonGuess)
      .where(and(eq(gameSeasonGuess.id, guess.id), isNull(gameSeasonGuess.settledAt)))
      .for("update");
    if (row === undefined) return false;
    const { userId } = row;
    if (judgement === "void") {
      const [paid] = await tx
        .select({ amount: gameLedger.amount })
        .from(gameLedger)
        .where(and(eq(gameLedger.seasonGuessId, guess.id), eq(gameLedger.kind, "season-guess")));
      await tx.insert(gameLedger).values({
        userId,
        seasonId: guess.seasonId,
        kind: "season-refund",
        amount: 0 - (paid?.amount ?? 0),
        seasonGuessId: guess.id,
      });
      await tx
        .update(gameSeasonGuess)
        .set({ settledAt: now })
        .where(eq(gameSeasonGuess.id, guess.id));
      return true;
    }
    await tx.insert(gameLedger).values({
      userId,
      seasonId: guess.seasonId,
      kind: "season-reward",
      amount: judgement.reward,
      seasonGuessId: guess.id,
    });
    await tx
      .update(gameSeasonGuess)
      .set({
        settledAt: now,
        reward: judgement.reward,
        rightCount: judgement.right,
        nearCount: judgement.near,
      })
      .where(eq(gameSeasonGuess.id, guess.id));
    return true;
  });
}

/**
 * What a guess's answer says of it, `null` while the answer is not in.
 *
 * decisions/075-season-guesses.md
 */
function judgementOf(guess: OpenSeasonGuess, answers: SeasonAnswers): SeasonJudgement | null {
  if (guess.kind === "upper") {
    return answers.upper === null ? null : judgeUpper(guess.teams, answers.upper);
  }
  if (answers.places === null) return null;
  return judgeByPlaces(
    { kind: guess.kind as Exclude<SeasonKind, "upper">, teams: guess.teams },
    answers.places
  );
}

/**
 * Settles every open season guess whose answer is in, and voids, refunding its
 * price, one still open once the next season's first fixture is stored. A
 * guess that fails is named in the report and left for the next run.
 *
 * decisions/075-season-guesses.md
 */
export async function settleSeasonGuesses(now: Date): Promise<SeasonSettleReport> {
  const report: SeasonSettleReport = { settled: 0, rewarded: 0, voided: 0, failed: [] };
  const open = await db
    .select({
      id: gameSeasonGuess.id,
      seasonId: gameSeasonGuess.seasonId,
      kind: gameSeasonGuess.kind,
      teams: gameSeasonGuess.teams,
    })
    .from(gameSeasonGuess)
    .where(isNull(gameSeasonGuess.settledAt));
  if (open.length === 0) return report;
  const latest = await latestSeason(db);
  for (const [seasonId, guesses] of Map.groupBy(open, (guess) => guess.seasonId)) {
    const season = await seasonOfId(db, seasonId);
    let answers: SeasonAnswers;
    try {
      answers = await readSeasonAnswers(seasonId, latest ?? seasonId, season.matches);
    } catch (error) {
      logger.error({ err: error, seasonId }, "Reading an Arvauspeli season's answers failed");
      report.failed.push(...guesses.map((guess) => guess.id));
      continue;
    }
    const replaced = latest !== null && latest > seasonId;
    for (const guess of guesses) {
      const judgement = judgementOf(guess, answers) ?? (replaced ? "void" : null);
      if (judgement === null) continue;
      try {
        if (!(await settleOne(guess, judgement, now))) continue;
        report.settled += 1;
        if (judgement === "void") report.voided += 1;
        else if (judgement.reward > 0) report.rewarded += 1;
      } catch (error) {
        logger.error(
          { err: error, seasonGuessId: guess.id },
          "Unable to settle an Arvauspeli season guess"
        );
        report.failed.push(guess.id);
      }
    }
  }
  logger.info(report, "Arvauspeli season guesses settled");
  return report;
}
