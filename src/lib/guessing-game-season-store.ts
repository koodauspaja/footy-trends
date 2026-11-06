import { and, asc, eq, isNull, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameLedger, gamePlayer, gameSeasonGuess, tasoMatches } from "@/db/schema";
import { categoryIdForSeason, competitionIdForSeason } from "./domestic-competitions";
import { SHARES_MIN_GUESSES } from "./guessing-game";
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
  seasonMatches,
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

/**
 * The groups the split makes of the regular season: the upper and the lower.
 *
 * decisions/075-season-guesses.md
 */
const UPPER_GROUP = 2;
const LOWER_GROUP = 3;
type SeasonGroup = typeof REGULAR_SEASON_GROUP | typeof UPPER_GROUP | typeof LOWER_GROUP;
/**
 * The teams a share line names before the rest are `muut`.
 *
 * decisions/075-season-guesses.md
 */
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
 * The lock: the season's first stored kickoff, or an earlier one a guess was
 * placed under, so a lock once passed stays passed when the first match is
 * postponed.
 *
 * decisions/075-season-guesses.md
 */
async function lockOf(client: Client, seasonId: number, firstKickoff: Date): Promise<Date> {
  const [row] = await client
    .select({ lockAt: min(gameSeasonGuess.lockAt) })
    .from(gameSeasonGuess)
    .where(eq(gameSeasonGuess.seasonId, seasonId));
  const stored = row?.lockAt ?? null;
  return stored !== null && stored < firstKickoff ? stored : firstKickoff;
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
 * decisions/072-match-guesses.md
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
    const firstKickoff = season.matches[0]?.kickoffAt;
    if (firstKickoff === undefined) return refused(userId, seasonId, kind, "no-season");
    const lock = await lockOf(tx, seasonId, firstKickoff);
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
        .set({ teams: guess.teams, changedAt: now })
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
      .values({
        userId,
        seasonId,
        kind: guess.kind,
        teams: guess.teams,
        madeAt: now,
        lockAt: lock,
      })
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
  if (total < SHARES_MIN_GUESSES) return null;
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
  now: Date,
  /** After the lock, whether a player with no guess still gets the shares. */
  sharesAlone = true
): Promise<SeasonSection | null> {
  return db.transaction(
    async (tx) => {
      const matches = await tx
        .select({ kickoffAt: tasoMatches.kickoffAt })
        .from(tasoMatches)
        .where(seasonOf(seasonId))
        .orderBy(asc(tasoMatches.kickoffAt))
        .limit(1);
      const firstKickoff = matches[0]?.kickoffAt;
      if (firstKickoff === undefined) return null;
      const lockAt = await lockOf(tx, seasonId, firstKickoff);
      const locked = now >= lockAt;
      const rows = await tx
        .select()
        .from(gameSeasonGuess)
        .where(and(eq(gameSeasonGuess.userId, userId), eq(gameSeasonGuess.seasonId, seasonId)));
      if (locked && rows.length === 0 && !sharesAlone) return null;
      const [teams, champion, last] = await Promise.all([
        seasonTeams(tx, seasonId),
        locked ? pickShares(tx, seasonId, "champion") : null,
        locked ? pickShares(tx, seasonId, "last") : null,
      ]);
      if (locked && rows.length === 0 && champion === null && last === null) return null;
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
 * One season's section, or `null` when its read fails: logged, and that
 * section left out, not the other or the game.
 *
 * decisions/075-season-guesses.md
 */
async function sectionOrNone(
  userId: string,
  seasonId: number,
  now: Date,
  sharesAlone: boolean
): Promise<SeasonSection | null> {
  try {
    return await readSeasonSection(userId, seasonId, now, sharesAlone);
  } catch (error) {
    logger.error({ err: error, userId, seasonId }, "Reading Arvauspeli season guesses failed");
    return null;
  }
}

/**
 * The sections a view shows: the season in play, and the one just finished
 * while the next is before its lock, or between seasons the one just finished.
 *
 * decisions/075-season-guesses.md
 */
export async function readSeasonSectionOf(
  view: GameView,
  userId: string,
  now: Date
): Promise<SeasonSections> {
  if (view.kind === "between" && view.joined) {
    return {
      current: await sectionOrNone(userId, view.nextSeasonId - 1, now, false),
      previous: null,
    };
  }
  if (view.kind !== "playing") return NO_SECTIONS;
  const current = await sectionOrNone(userId, view.seasonId, now, true);
  const previous =
    current === null || current.locked
      ? null
      : await sectionOrNone(userId, view.seasonId - 1, now, false);
  return { current, previous };
}

/**
 * The page's season sections: the season the view is about, and the one just
 * finished while the next is before its lock.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonSections = { current: SeasonSection | null; previous: SeasonSection | null };
const NO_SECTIONS: SeasonSections = { current: null, previous: null };

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
 * Each group's matches in today's format (S14): 12 teams over 22 rounds, then
 * six over 10 rounds and six over 5.
 *
 * decisions/075-season-guesses.md
 */
const GROUP_MATCHES: Readonly<Record<SeasonGroup, number>> = {
  [REGULAR_SEASON_GROUP]: 132,
  [UPPER_GROUP]: 30,
  [LOWER_GROUP]: 15,
};

/**
 * Whether a group's whole format has been played: as many finished matches as
 * it has, so a schedule stored in part, or an abandoned match never replayed,
 * leaves it unplayed.
 *
 * decisions/075-season-guesses.md
 */
function groupPlayed(matches: readonly SeasonMatch[], groupId: SeasonGroup): boolean {
  const finished = matches.filter(
    (match) => match.groupId === groupId && match.status === FINISHED
  );
  return finished.length >= GROUP_MATCHES[groupId];
}

/**
 * Which parts of a season's answers a read is for: the six, the final places.
 *
 * decisions/075-season-guesses.md
 */
type AnswersNeeded = Readonly<{ upper: boolean; places: boolean }>;
const EVERY_ANSWER: AnswersNeeded = { upper: true, places: true };

/**
 * Reads the answers an open guess needs and the stored matches say are due. A
 * failed read throws, and so does a due group with no table to judge by.
 *
 * decisions/075-season-guesses.md
 */
export async function readSeasonAnswers(
  seasonId: number,
  activeSeasonId: number,
  matches: readonly SeasonMatch[],
  need: AnswersNeeded = EVERY_ANSWER
): Promise<SeasonAnswers> {
  const regularPlayed = need.upper && groupPlayed(matches, REGULAR_SEASON_GROUP);
  const splitPlayed =
    need.places && groupPlayed(matches, UPPER_GROUP) && groupPlayed(matches, LOWER_GROUP);
  if (!regularPlayed && !splitPlayed) return { upper: null, places: null };
  const result = await getSeasonStandings(
    categoryIdForSeason(COMPETITION, seasonId),
    competitionIdForSeason(COMPETITION, seasonId),
    seasonId,
    activeSeasonId,
    undefined
  );
  if (result.status === "error") throw new Error(`Season ${seasonId}'s tables could not be read`);
  // A group that is due must have a table: without one the guess cannot be
  // judged, which is a failure to report, not an answer still to come.
  const rows = (groupId: number): TableRow[] => {
    const group = result.groups.find((candidate) => candidate.groupId === groupId);
    if (group === undefined || group.kind === "match-list") {
      throw new Error(`Season ${seasonId}'s group ${groupId} has no table`);
    }
    return group.standings;
  };
  return {
    upper: regularPlayed ? upperSix(rows(REGULAR_SEASON_GROUP)) : null,
    places: splitPlayed ? finalPlaces(rows(UPPER_GROUP), rows(LOWER_GROUP)) : null,
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

type OpenSeasonGuess = {
  id: number;
  userId: string;
  seasonId: number;
  kind: string;
  teams: number[];
};

/**
 * Settles one guess in its own transaction, the player and then the open row
 * locked: by its judgement, or `void` with the price refunded. `false` when
 * another run settled it first.
 *
 * decisions/075-season-guesses.md
 */
async function settleOne(
  guess: OpenSeasonGuess,
  judgement: SeasonJudgement | "void",
  now: Date
): Promise<boolean> {
  const { userId } = guess;
  return db.transaction(async (tx) => {
    await tx
      .select({ userId: gamePlayer.userId })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, userId))
      .for("share");
    const [row] = await tx
      .select({ id: gameSeasonGuess.id })
      .from(gameSeasonGuess)
      .where(and(eq(gameSeasonGuess.id, guess.id), isNull(gameSeasonGuess.settledAt)))
      .for("update");
    if (row === undefined) return false;
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
 * Settles one guess and counts it; a failure is logged, named in the report
 * and left for the next run.
 *
 * decisions/075-season-guesses.md
 */
async function settleCounted(
  guess: OpenSeasonGuess,
  judgement: SeasonJudgement | "void",
  now: Date,
  report: SeasonSettleReport
): Promise<void> {
  try {
    if (!(await settleOne(guess, judgement, now))) return;
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

/**
 * Whether a guess's answer is due by the season's stored matches: the six once
 * the regular season is played, the rest once both groups are.
 *
 * decisions/075-season-guesses.md
 */
function answerDue(guess: OpenSeasonGuess, matches: readonly SeasonMatch[]): boolean {
  return guess.kind === "upper"
    ? groupPlayed(matches, REGULAR_SEASON_GROUP)
    : groupPlayed(matches, UPPER_GROUP) && groupPlayed(matches, LOWER_GROUP);
}

/**
 * Settles one season's open guesses whose answer is in, and voids the rest once
 * a later season is stored; a due guess whose tables cannot be read is named
 * in the report for the next run.
 *
 * decisions/075-season-guesses.md
 */
async function settleSeason(
  seasonId: number,
  guesses: readonly OpenSeasonGuess[],
  latest: number,
  now: Date,
  report: SeasonSettleReport
): Promise<void> {
  const replaced = latest > seasonId;
  let matches: readonly SeasonMatch[];
  try {
    matches = await seasonMatches(db, seasonId);
  } catch (error) {
    logger.error({ err: error, seasonId }, "Reading an Arvauspeli season's answers failed");
    report.failed.push(...guesses.map((guess) => guess.id));
    return;
  }
  let answers: SeasonAnswers;
  let pending = guesses;
  const need = {
    upper: guesses.some((guess) => guess.kind === "upper"),
    places: guesses.some((guess) => guess.kind !== "upper"),
  };
  try {
    answers = await readSeasonAnswers(seasonId, latest, matches, need);
  } catch (error) {
    logger.error({ err: error, seasonId }, "Reading an Arvauspeli season's answers failed");
    const due = guesses.filter((guess) => answerDue(guess, matches));
    report.failed.push(...due.map((guess) => guess.id));
    answers = { upper: null, places: null };
    pending = guesses.filter((guess) => !due.includes(guess));
  }
  // One at a time, so a season's guesses never hold a connection each.
  await pending.reduce<Promise<void>>(async (previous, guess) => {
    await previous;
    const judgement = judgementOf(guess, answers) ?? (replaced ? "void" : null);
    if (judgement !== null) await settleCounted(guess, judgement, now, report);
  }, Promise.resolve());
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
      userId: gameSeasonGuess.userId,
      seasonId: gameSeasonGuess.seasonId,
      kind: gameSeasonGuess.kind,
      teams: gameSeasonGuess.teams,
    })
    .from(gameSeasonGuess)
    .where(isNull(gameSeasonGuess.settledAt));
  if (open.length > 0) await settleOpen(open, now, report);
  logger.info(report, "Arvauspeli season guesses settled");
  return report;
}

/**
 * Settles the open guesses season by season, one at a time.
 *
 * decisions/075-season-guesses.md
 */
async function settleOpen(
  open: readonly OpenSeasonGuess[],
  now: Date,
  report: SeasonSettleReport
): Promise<void> {
  const bySeason = [...Map.groupBy(open, (guess) => guess.seasonId)];
  // A guess exists only for a season whose fixtures are stored, so one is.
  const latest = (await latestSeason(db)) ?? Math.max(...bySeason.map(([seasonId]) => seasonId));
  await bySeason.reduce<Promise<void>>(async (previous, [seasonId, guesses]) => {
    await previous;
    await settleSeason(seasonId, guesses, latest, now, report);
  }, Promise.resolve());
}
