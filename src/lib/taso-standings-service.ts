import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { tasoGroupTeams, tasoMatches } from "@/db/schema";
import { getCached } from "./cache";
import { categoryIdForSeason, categoryIdsFor, earliestSeasonFor } from "./domestic-competitions";
import { logger } from "./logger";
import {
  calculateStandings,
  type NormalizedMatch,
  selectTeamMatches,
  type TeamStanding,
} from "./standings";
import {
  competitionIdFromSeason,
  EARLIEST_TASO_SEASON,
  getCurrentSeason,
  getSeasonCategoryNames,
  getSeasonGroups,
  getSeasonMatches,
  type NormalizedTasoGroupTeam,
  type NormalizedTasoMatch,
  normalizeGroupTeams,
} from "./taso";

const FINISHED_STATUS = "FINISHED";
/**
 * Shared by `needsRefresh` (current-season match staleness) and
 * `getCachedSeasonGroups` (current-season groups cache) — one constant,
 * not two, since `taso.ts` itself does no caching of its own; both uses
 * live here where they're actually consumed. See
 * specs/009-veikkausliiga.md's caching section.
 */
const CURRENT_SEASON_CACHE_TTL_SECONDS = 15 * 60;

type StoredTasoMatch = typeof tasoMatches.$inferSelect;
type StoredGroupTeam = typeof tasoGroupTeams.$inferSelect;
/** A match from either the DB or a fresh provider fetch — same duality as football-data.ts. */
type MatchRow = NormalizedTasoMatch;

/**
 * `categoryId + competitionId + groupId → parent group`. An entry says that a
 * group continues its parent's points, so both groups' matches are fed to
 * `calculateStandings` rather than the child's alone.
 *
 * An entry is not what decides whether a group can be calculated. Every group
 * with a table is calculated from its own matches plus any configured parent,
 * and TASO's own numbers are used only when the result does not reconcile with
 * them — see `reproducesTasoPoints`. So a group with no entry here is not
 * "the origin group"; it is simply one with nothing to carry over, which is
 * true of a season's first group and of Kakkonen's three parallel pools alike.
 *
 * Only a group confirmed — via TASO's own `starting_points` and/or a
 * from-scratch `calculateStandings` cross-check — to continue its parent's
 * points gets an entry. A missing one is therefore visible rather than wrong:
 * the group falls back to TASO's numbers with a notice.
 *
 * Every entry here is asserted against TASO's own published standings in
 * `tests/unit/lib/taso-carry-over.test.ts`. Adding a season without adding
 * its fixture there fails that file's coverage check.
 *
 * Veikkausliiga 2020 is absent because that season never split; 2026 waits
 * until its split groups exist and can be validated the same way. 2019
 * restarts its split-group round numbering at 1; `withContinuedRoundNumbering`
 * handles that, which is what unblocked its entry (#133).
 *
 * Keyed by category first: `competition_id` alone is the season umbrella that
 * every Finnish competition shares, so `spljp25: { 2: 1 }` would otherwise
 * apply Veikkausliiga's carry-over to every other competition's group 2. See
 * specs/013-more-finnish-competitions.md.
 */
type CarryOverEntry = {
  parent: number;
  /**
   * Which convention TASO used for this group, which decides what
   * `starting_points` means — see `adjustmentsFor`.
   *
   * `true` (2015-2024): `starting_points` is the team's points in the parent
   * group, so TASO's published points are the child's own results plus that
   * seed.
   * `false` (2025 on): `starting_points` is 0, or a deduction, and the
   * parent's results are simply counted in the child's points.
   *
   * Only the *points* representation differs. `matches_played` includes the
   * parent's matches either way — Veikkausliiga 2022's Mestaruussarja reports
   * 27, which is Runkosarja's 22 plus its own 5 — which is why the summed
   * calculation is right for both and only the adjustment needs the flag.
   */
  seeded: boolean;
};

const CARRY_OVER_CONFIG: Record<string, Record<string, Record<number, CarryOverEntry>>> = {
  VL: {
    spljp19: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
  },
};

/**
 * Every configured carry-over mapping, flattened to one entry per
 * `competitionId + groupId`. Exported so the validation test can assert the
 * config against its fixtures exactly: a wrong entry is invisible in
 * production, since the table still renders with wrong points.
 *
 * Flattened rather than keyed by competition on purpose. Exposing only the
 * competition ids would let a *new group* be added to an
 * already-fixtured season — `spljp25: { 2: 1, 3: 1, 4: 1 }` — without any
 * test covering it.
 */
export function listCarryOverEntries(): {
  categoryId: string;
  competitionId: string;
  groupId: number;
}[] {
  return Object.entries(CARRY_OVER_CONFIG).flatMap(([categoryId, competitions]) =>
    Object.entries(competitions).flatMap(([competitionId, groups]) =>
      Object.keys(groups).map((groupId) => ({
        categoryId,
        competitionId,
        groupId: Number(groupId),
      }))
    )
  );
}

function carryOverEntry(
  categoryId: string,
  competitionId: string,
  groupId: number
): CarryOverEntry | null {
  return CARRY_OVER_CONFIG[categoryId]?.[competitionId]?.[groupId] ?? null;
}

function parentGroupId(categoryId: string, competitionId: string, groupId: number): number | null {
  return carryOverEntry(categoryId, competitionId, groupId)?.parent ?? null;
}

/** Own-calculated groups always have a carry-over entry, or are the season's origin group (no group needs the entry to be own-calculated when it has no parent). */
/**
 * Spec 009 decided "can we calculate this group ourselves?" by shape: the
 * lowest `group_id` present was the origin and everything above it was
 * pass-through. That held only because Veikkausliiga has exactly one origin
 * group per season, and spec 013 confirms three ways it does not generalise —
 * Kakkonen runs three parallel pools that are each an origin, P21 Ykkönen 2026
 * has no group 1 at all (ids run 2-5), and P20 Ykkönen 2024 is non-contiguous
 * (1, 2, 10, 11, 12).
 *
 * So there is no shape test any more. Every group with a table is calculated
 * from its own matches, plus its parent's where a carry-over entry says so,
 * and the question becomes one of *result*: `getSeasonStandings` compares the
 * finished table against TASO's own published points and falls back to TASO's
 * numbers when they disagree. That keeps spec 009's guarantee — an
 * unvalidated group never shows silently wrong points — without the
 * heuristic.
 */

/**
 * A pass-through group's standing, straight from TASO's own `getGroups`
 * numbers — used whenever our own full-season calculation does not reproduce
 * TASO's published points for the group, whatever the cause. Spec 009 chose
 * this path by shape (no `CARRY_OVER_CONFIG` entry); it is now chosen by
 * result. See `reproducesTasoPoints`.
 *
 * **No Veikkausliiga season reaches this path**, confirmed live across
 * 2015-2026: every group reconciles exactly. It is the landing place for a
 * group we get wrong — a season that splits before its carry-over entry is
 * validated, or the two P20 Ykkönen groups spec 013 could not explain — so
 * that such a group shows TASO's own numbers rather than a silently
 * miscalculated table.
 *
 * Every field is nullable because TASO's own rows are: a stat it did not
 * report must render as "–" rather than be coerced to a misleading `0`. A
 * group with no stats at all has no standings and renders as a match list —
 * see `keepsATable`.
 *
 * `form` is always empty: these numbers are TASO's, with no match-by-match
 * data behind them to derive it from.
 */
export type TasoTeamStanding = {
  position: number;
  teamProviderId: number;
  teamName: string;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
  points: number | null;
  form: [];
};

/**
 * A group renders one of three ways:
 *
 * - `own-calculated` — `calculateStandings` over the group's own matches
 *   (plus its parent's, for a carry-over group). Has a round selector.
 * - `pass-through` — TASO's own precomputed `getGroups` numbers, selected
 *   when our calculated full-season points do not reproduce TASO's published
 *   ones. No round selector.
 * - `match-list` — a group with no table at all, rendered as its matches.
 *   Two causes: a knockout group, where `getGroups` returns one row per
 *   bracket *slot* rather than per team so a table would repeat an advancing
 *   team (specs/010-playoff-group-match-list.md); and a group TASO returns
 *   with no teams whatsoever, which is how an unplayed qualifying match
 *   appears (three of them in 2026).
 */
export type GroupStandingsResult =
  | { kind: "own-calculated"; groupId: number; groupName: string; standings: TeamStanding[] }
  | { kind: "pass-through"; groupId: number; groupName: string; standings: TasoTeamStanding[] }
  | { kind: "match-list"; groupId: number; groupName: string; matches: MatchRow[] };

export type SeasonStandingsResult =
  | { status: "ok"; groups: GroupStandingsResult[] }
  | { status: "empty"; groups: [] }
  | { status: "error"; groups: [] };

export type SeasonMatchesResult =
  | { status: "ok"; matches: MatchRow[] }
  | { status: "empty" }
  | { status: "error" };

export type TeamMatchesResult =
  | { status: "ok"; matches: MatchRow[] }
  | { status: "not_found" }
  | { status: "empty" }
  | { status: "error" };

function toFinishedMatches(matchList: MatchRow[]): NormalizedMatch[] {
  return matchList.filter(
    (match): match is MatchRow & { homeGoals: number; awayGoals: number } =>
      match.status === FINISHED_STATUS && match.homeGoals !== null && match.awayGoals !== null
  );
}

function filterByRound<T extends { matchday: number | null }>(
  matchList: T[],
  round: number | undefined
): T[] {
  if (round === undefined) return matchList;
  return matchList.filter((match) => match.matchday !== null && match.matchday <= round);
}

/**
 * A completed season (every season except the newest, which is still being
 * played) never changes once synced, so it is fetched at most once — the
 * freshness threshold below only applies to the season currently being
 * played. Mirrors `needsRefresh` in standings-service.ts — see
 * specs/009-veikkausliiga.md's caching section.
 *
 * `storedMatches` must be ordered newest `updatedAt` first.
 */
export function needsRefresh(
  seasonId: number,
  activeSeasonId: number,
  storedMatches: Array<Pick<StoredTasoMatch, "updatedAt">>
): boolean {
  const newestUpdate = storedMatches[0]?.updatedAt;
  if (newestUpdate === undefined) return true;
  if (seasonId < activeSeasonId) return false;

  return Date.now() - newestUpdate.getTime() >= CURRENT_SEASON_CACHE_TTL_SECONDS * 1000;
}

/**
 * Newest season with a stored match for this competition, or `null` if it has
 * none.
 *
 * Scoped to every category the competition has been published under, not one:
 * a junior competition's rows are split across two or three ids, and asking
 * about a single era would miss the rest — a discovery failure would then fall
 * back to the configured floor rather than to what is actually stored.
 */
async function newestStoredSeason(categoryIds: string[]): Promise<number | null> {
  const [row] = await db
    .select({ seasonId: sql<number | null>`max(${tasoMatches.seasonId})` })
    .from(tasoMatches)
    .where(inArray(tasoMatches.categoryId, categoryIds));
  return row?.seasonId ?? null;
}

/** Discovery is best-effort: a TASO outage must degrade the season range, not break the page. */
async function discoverCurrentSeason(): Promise<number | null> {
  try {
    return await getCurrentSeason();
  } catch (error) {
    logger.warn({ err: error }, "TASO season discovery failed; falling back to stored seasons");
    return null;
  }
}

export type TasoSeasonContext = {
  /** The selector's ceiling, and the season `needsRefresh` treats as refreshable. */
  currentSeason: number;
  /** Where a page with no `kausi` param lands — never a season with no matches. */
  defaultSeason: number;
};

/**
 * Replaces spec 009's hardcoded `LATEST_TASO_SEASON`. See
 * specs/011-current-season-discovery.md.
 *
 * `currentSeason` falls back through discovery → newest stored season →
 * the configured floor, so an outage degrades to stale-but-correct rather
 * than an error page.
 *
 * `defaultSeason` additionally requires the season to *have* matches. TASO
 * publishes a `competition_id` before that season kicks off, and landing on
 * a season with none would render the empty state for however long the gap
 * lasts. Unplayed fixtures are fine — spec 008's roster seeding shows every
 * team at zero stats, which is a correct pre-season table.
 *
 * That check has to sync the season to answer "does it have matches", since
 * a season absent from the database is indistinguishable from one that is
 * merely unvisited. It is the same work the page does for whatever season it
 * renders, deduplicated within a request by `cache()` and bounded across
 * requests by the 15-minute Redis TTL.
 */
export const resolveTasoSeasonContext = cache(async function resolveTasoSeasonContext(
  competitionCode: string
): Promise<TasoSeasonContext> {
  const key = `taso:season-context:${competitionCode}`;
  return getCached(key, CURRENT_SEASON_CACHE_TTL_SECONDS, async () => {
    // Season discovery itself is competition-agnostic — a `competition_id`
    // is a season of all Finnish football (spec 011) — but the *probe*
    // below is not, so both the key and the stored fallback are scoped to
    // the competition being asked about.
    const [discovered, newestStored] = await Promise.all([
      discoverCurrentSeason(),
      newestStoredSeason(categoryIdsFor(competitionCode)),
    ]);
    // Floored at the competition's own first season, not the provider-wide
    // one. Without that, a discovery failure with nothing stored would put
    // Ykkösliiga's ceiling at 2015 — below its 2024 floor — and
    // `listSelectableTasoSeasons` counts down from the ceiling to the floor,
    // so the selector would come back empty and the page would query a season
    // the competition never had.
    const currentSeason = Math.max(
      discovered ?? newestStored ?? EARLIEST_TASO_SEASON,
      earliestSeasonFor(competitionCode)
    );

    try {
      const { matches } = await getSyncedSeasonMatches(
        categoryIdForSeason(competitionCode, currentSeason),
        competitionIdFromSeason(currentSeason),
        currentSeason,
        currentSeason
      );
      if (matches.length > 0) return { currentSeason, defaultSeason: currentSeason };
    } catch (error) {
      logger.warn(
        { err: error, competitionCode, currentSeason },
        "Unable to check the current season for matches"
      );
    }

    // Clamped to both ends of the selector's range, because a default outside
    // it lands the page on a season the selector does not offer.
    //
    // Above: `newestStored` can exceed `currentSeason` if TASO stops reporting
    // a season we already synced, and such a default is also one `needsRefresh`
    // would treat as newer than active. Below: a stored row older than the
    // competition's first season — stale data from before its floor was
    // configured — would otherwise default Ykkösliiga to a season it never had.
    //
    // Neither is the dropped "raise the ceiling to cover stored data" guard;
    // both keep the fallback inside the range rather than widening it. See
    // specs/011-current-season-discovery.md.
    const fallbackDefault = Math.max(
      earliestSeasonFor(competitionCode),
      Math.min(newestStored ?? currentSeason, currentSeason)
    );
    return { currentSeason, defaultSeason: fallbackDefault };
  });
});

/**
 * The name a competition carried in one season, or `null` when TASO cannot be
 * asked. Cached like the groups were: a completed season's names never change,
 * and the current season's are unlikely to.
 *
 * Best-effort by design — a name is presentation, so a failure falls back to
 * the competition's current name rather than breaking the page.
 */
export async function getSeasonCategoryName(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<string | null> {
  const ttl = seasonId >= activeSeasonId ? CURRENT_SEASON_CACHE_TTL_SECONDS : 60 * 60 * 24 * 365;
  try {
    const names = await getCached<Record<string, string>>(
      `taso:categories:${competitionId}`,
      ttl,
      () => getSeasonCategoryNames(competitionId)
    );
    return names[categoryId] ?? null;
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to read TASO category names; falling back to the configured name"
    );
    return null;
  }
}

/** Stored rows, refreshed from TASO when stale. Round numbers are as TASO sends them. */
async function loadSeasonMatches(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ matches: MatchRow[]; refreshFailed: boolean }> {
  const storedMatches = await db
    .select()
    .from(tasoMatches)
    .where(
      and(
        eq(tasoMatches.categoryId, categoryId),
        eq(tasoMatches.competitionCode, competitionId),
        eq(tasoMatches.seasonId, seasonId)
      )
    )
    .orderBy(desc(tasoMatches.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, storedMatches)) {
    return { matches: storedMatches, refreshFailed: false };
  }

  try {
    const providerMatches = await getSeasonMatches(competitionId, categoryId);
    await synchronizeMatches(providerMatches);
    return { matches: providerMatches, refreshFailed: false };
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "TASO refresh failed; using stored matches"
    );
    return { matches: storedMatches, refreshFailed: true };
  }
}

/** A group's own round numbers, or `null` when it has none. */
function roundRange(matchList: MatchRow[], groupId: number): { min: number; max: number } | null {
  const rounds = matchList
    .filter((match) => match.groupId === groupId && match.matchday !== null)
    .map((match) => match.matchday as number);
  return rounds.length === 0 ? null : { min: Math.min(...rounds), max: Math.max(...rounds) };
}

/**
 * TASO numbers a split group's rounds inconsistently between seasons: 2021,
 * 2024 and 2025 continue the season's numbering (Runkosarja 1–22, then 23
 * onward), while 2019, 2022 and 2023 restart their split groups at 1.
 *
 * The round filter depends on the former, which is what spec 009 specifies:
 * `filterByRound` takes `matchday <= round` across a carry-over group's
 * combined parent + child matches, so a child round of `5` is
 * indistinguishable from Runkosarja's round `5`. On 2022, "Kierros 5"
 * showed every Mestaruussarja team with 10 matches played rather than 5,
 * and the selector offered nothing above Runkosarja's 22.
 *
 * A carry-over group whose rounds overlap its parent's is therefore shifted
 * to continue from the parent's last round. Derived from the data rather
 * than a per-season constant, so it self-corrects if TASO changes its
 * numbering for a future season, and it is a no-op for the seasons that
 * already continue correctly. See #133.
 */
function withContinuedRoundNumbering(
  matchList: MatchRow[],
  categoryId: string,
  competitionId: string
): MatchRow[] {
  const offsets = new Map<number, number>();

  for (const groupId of groupIdsIn(matchList)) {
    const parent = parentGroupId(categoryId, competitionId, groupId);
    if (parent === null) continue;

    const childRounds = roundRange(matchList, groupId);
    const parentRounds = roundRange(matchList, parent);
    if (childRounds === null || parentRounds === null) continue;
    // Already continues the parent's numbering — nothing to shift.
    if (childRounds.min > parentRounds.max) continue;

    // Maps the child's *first* round onto the parent's next one. Shifting by
    // the parent's last round alone would only be correct for a child that
    // starts at 1: an overlapping range starting at 20 would land on 42
    // rather than 23.
    offsets.set(groupId, parentRounds.max - childRounds.min + 1);
  }

  if (offsets.size === 0) return matchList;

  return matchList.map((match) => {
    const offset = offsets.get(match.groupId);
    return offset === undefined || match.matchday === null
      ? match
      : { ...match, matchday: match.matchday + offset };
  });
}

/**
 * The single funnel every `/kotimaa` page reads season matches through, so
 * the round renumbering above applies uniformly to the standings, the
 * season match list and a team's match list rather than only where the
 * filter runs.
 *
 * Wrapped in React's `cache()` so one request syncs a season at most once,
 * however many times it is asked for — `/kotimaa/sarjataulukko` needs the
 * season's matches both to build the round list and to calculate the
 * tables, and Next.js invokes a page's `generateMetadata` and its default
 * export separately, so the team page would otherwise sync twice per
 * request. Without this, a stale current season re-fetches TASO's ~1 MB
 * season response and re-upserts every row two times over. Same reasoning
 * (and the same fix) as `getSeasonContext`/`getTeamMatches` in
 * football-data.ts and standings-service.ts.
 */
const getSyncedSeasonMatches = cache(async function getSyncedSeasonMatches(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ matches: MatchRow[]; refreshFailed: boolean }> {
  const { matches, refreshFailed } = await loadSeasonMatches(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  return {
    matches: withContinuedRoundNumbering(matches, categoryId, competitionId),
    refreshFailed,
  };
});

export async function synchronizeMatches(providerMatches: NormalizedTasoMatch[]): Promise<void> {
  if (providerMatches.length === 0) return;

  await db
    .insert(tasoMatches)
    .values(providerMatches.map((match) => ({ ...match, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: tasoMatches.providerMatchId,
      set: {
        competitionCode: sql`excluded.competition_id`,
        categoryId: sql`excluded.category_id`,
        seasonId: sql`excluded.season_id`,
        groupId: sql`excluded.group_id`,
        groupName: sql`excluded.group_name`,
        kickoffAt: sql`excluded.kickoff_at`,
        matchday: sql`excluded.matchday`,
        status: sql`excluded.status`,
        homeTeamProviderId: sql`excluded.home_team_provider_id`,
        homeTeamName: sql`excluded.home_team_name`,
        awayTeamProviderId: sql`excluded.away_team_provider_id`,
        awayTeamName: sql`excluded.away_team_name`,
        homeGoals: sql`excluded.home_goals`,
        awayGoals: sql`excluded.away_goals`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * A knockout group returns one row per bracket *slot*, not per team, so a team
 * that advances appears several times in the same group — spec 010 documented
 * this for the standings table, and it bites the storage layer too: Postgres
 * rejects a whole `ON CONFLICT DO UPDATE` statement that touches one row
 * twice ("cannot affect row a second time"), which silently cost Veikkausliiga
 * 2019 and 2022 their entire stored group standings.
 *
 * The first slot wins. Which one is arbitrary and does not matter: a group
 * with duplicates is a knockout group, it has no points, and it renders as a
 * match list rather than a table.
 */
function dedupeByIdentity(rows: NormalizedTasoGroupTeam[]): NormalizedTasoGroupTeam[] {
  const seen = new Map<string, NormalizedTasoGroupTeam>();
  for (const row of rows) {
    const identity = `${row.categoryId}/${row.competitionCode}/${row.seasonId}/${row.groupId}/${row.teamProviderId}`;
    if (!seen.has(identity)) seen.set(identity, row);
  }
  return [...seen.values()];
}

/**
 * Replaces a season's stored group standings with the snapshot TASO just
 * returned, rather than merging into it.
 *
 * Upserting alone would leave behind any team TASO has since dropped from a
 * group, and a stale row is not inert: it carries an obsolete
 * `starting_points`, it shows up in a fallback table, and — because
 * `reproducesTasoPoints` requires every team TASO ranks to appear in our
 * calculation — a team TASO no longer ranks would quietly push the whole group
 * onto the fallback path.
 *
 * Delete and insert together in a transaction, so a failure mid-way leaves the
 * previous snapshot intact rather than an empty group.
 */
export async function synchronizeGroupTeams(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  rows: NormalizedTasoGroupTeam[]
): Promise<void> {
  // No early return on an empty snapshot: TASO answering "this season has no
  // group standings" is an answer, not a non-answer, and keeping the previous
  // rows would leave every dropped team in place. A failed *request* is the
  // case that preserves what is stored, and that is handled by the caller's
  // catch rather than here.
  await db.transaction(async (tx) => {
    await tx
      .delete(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, categoryId),
          eq(tasoGroupTeams.competitionCode, competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      );

    if (rows.length === 0) return;

    await tx
      .insert(tasoGroupTeams)
      .values(dedupeByIdentity(rows).map((row) => ({ ...row, updatedAt: new Date() })));
  });
}

/**
 * TASO's own group standings, stored rather than only Redis-cached.
 *
 * Spec 009 kept these in Redis because they were needed only for the
 * pass-through path. Own-calculated standings now depend on
 * `starting_points`, so a cold cache or a TASO outage would silently change a
 * table's points — a much worse failure than a stale table. Refreshed on the
 * same rule as matches. See specs/013-more-finnish-competitions.md.
 */
const getSyncedGroupTeams = cache(async function getSyncedGroupTeams(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<StoredGroupTeam[]> {
  const stored = await db
    .select()
    .from(tasoGroupTeams)
    .where(
      and(
        eq(tasoGroupTeams.categoryId, categoryId),
        eq(tasoGroupTeams.competitionCode, competitionId),
        eq(tasoGroupTeams.seasonId, seasonId)
      )
    )
    .orderBy(desc(tasoGroupTeams.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, stored)) return stored;

  try {
    const groups = await getSeasonGroups(competitionId, categoryId);
    const rows = normalizeGroupTeams(groups, categoryId, competitionId, seasonId);
    await synchronizeGroupTeams(categoryId, competitionId, seasonId, rows);
    // Re-read rather than returning `rows`: the caller needs full stored rows,
    // and the snapshot has just replaced whatever was there.
    return await db
      .select()
      .from(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, categoryId),
          eq(tasoGroupTeams.competitionCode, competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      )
      .orderBy(desc(tasoGroupTeams.updatedAt));
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "TASO group refresh failed; using stored group standings"
    );
    return stored;
  }
});

/** One group's stored TASO rows. */
function groupTeamsFor(teamRows: StoredGroupTeam[], groupId: number): StoredGroupTeam[] {
  return teamRows.filter((row) => row.groupId === groupId);
}

/** Distinct group ids present in `matchList`, regardless of status. */
function groupIdsIn(matchList: MatchRow[]): number[] {
  return [...new Set(matchList.map((match) => match.groupId))];
}

/** `groupId` always comes from `groupIdsIn(matchList)`, so a match always exists. */
function groupNameOf(matchList: MatchRow[], groupId: number): string {
  // biome-ignore lint/style/noNonNullAssertion: groupId is always derived from this same matchList
  return matchList.find((match) => match.groupId === groupId)!.groupName;
}

/**
 * The position TASO itself published for a row, or `null` when it published
 * neither. `current_standing` is the live one and `final_group_standing` the
 * settled one; a completed season has both, an unstarted group neither.
 */
/** Sorts a row TASO never ranked to the end rather than the front. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

function publishedPosition(team: StoredGroupTeam): number | null {
  return team.currentStanding ?? team.finalGroupStanding;
}

/**
 * `position` is the row's place in TASO's own order rather than TASO's literal
 * `current_standing`. The two agree whenever TASO ranks every team 1..n, which
 * is the normal case; they differ only where its numbering has a gap or a row
 * it never ranked, and there a literal copy produces duplicates — two rows both
 * numbered 1 in the rendered table.
 */
function toPassThroughStanding(team: StoredGroupTeam, index: number): TasoTeamStanding {
  return {
    position: index + 1,
    teamProviderId: team.teamProviderId,
    teamName: team.teamName,
    played: team.played,
    won: team.won,
    drawn: team.drawn,
    lost: team.lost,
    goalsFor: team.goalsFor,
    goalsAgainst: team.goalsAgainst,
    goalDifference: team.goalDifference,
    points: team.points,
    form: [],
  };
}

/** One group's own matches, chronological — the playoff groups' equivalent of a standings table. */
function selectGroupMatches(seasonMatches: MatchRow[], groupId: number): MatchRow[] {
  return seasonMatches
    .filter((match) => match.groupId === groupId)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());
}

/** Every team appearing in a group's own matches — who actually belongs in that group's table. */
function teamIdsInGroup(seasonMatches: MatchRow[], groupId: number): Set<number> {
  return new Set(
    seasonMatches
      .filter((match) => match.groupId === groupId)
      .flatMap((match) => [match.homeTeamProviderId, match.awayTeamProviderId])
  );
}

/**
 * One own-calculated group's table.
 *
 * A carry-over group's points come from its parent's matches *plus* its own
 * (Mestaruussarja continues from Runkosarja), so both are fed to
 * `calculateStandings`. But the parent group is bigger than the child — all
 * 12 Runkosarja teams, not just the 6 that reached Mestaruussarja — so the
 * result is filtered back down to the child's own teams afterwards, and
 * positions renumbered from 1. Filtering the *matches* instead would be
 * wrong: a Mestaruussarja team's Runkosarja points include matches against
 * teams that later went to Karsintasarja, and dropping those would
 * under-count it (KuPS 2025 would show 44 - those matches, not its real 67).
 *
 * Renumbering matches TASO's own `final_group_standing`, which is relative
 * to the group (1–6 in both split groups, not offset to 7–12) — see
 * specs/009-veikkausliiga.md's Out of scope.
 */
function ownCalculatedStandings(
  seasonMatches: MatchRow[],
  /** Scoped to this group already — a season-wide list would let one group's `starting_points` overwrite another's, since adjustments are keyed by team. */
  groupTeamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string,
  groupId: number,
  round: number | undefined
): TeamStanding[] {
  const entry = carryOverEntry(categoryId, competitionId, groupId);
  const parent = entry?.parent ?? null;
  const contributingMatches = seasonMatches.filter(
    (match) => match.groupId === groupId || (parent !== null && match.groupId === parent)
  );
  const groupTeamIds = teamIdsInGroup(seasonMatches, groupId);
  const adjustments = adjustmentsFor(seasonMatches, groupTeamRows, entry);

  return calculateStandings(
    filterByRound(toFinishedMatches(contributingMatches), round),
    contributingMatches
  )
    .filter((team) => groupTeamIds.has(team.teamProviderId))
    .map((team) => {
      const adjustment = adjustments.get(team.teamProviderId) ?? 0;
      return adjustment === 0 ? team : { ...team, points: team.points + adjustment };
    })
    .sort(byStandingOrder)
    .map((team, index) => ({ ...team, position: index + 1 }));
}

/**
 * `calculateStandings` has already ordered the table, but an adjustment moves
 * a team afterwards — Ykkönen 2025's FC Jazz drops three places on a −3
 * deduction. Re-sorted on the same keys `calculateStandings` uses, so the two
 * orderings cannot drift apart.
 */
function byStandingOrder(left: TeamStanding, right: TeamStanding): number {
  return (
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    left.teamName.localeCompare(right.teamName)
  );
}

/**
 * How many points to add to each team's calculated total, from TASO's
 * `starting_points`.
 *
 * That one field carries three different things, confirmed across 262 groups
 * and twelve seasons (see specs/013-more-finnish-competitions.md):
 *
 * - **A deduction** (negative). Veikkausliiga 2016's PK-35 Vantaa is −6, which
 *   is why the app showed it on 19 points against TASO's 13 before this.
 * - **A qualifying bonus** (positive 1–3), which every junior SM season
 *   carries over from its qualifying series — a different category entirely,
 *   so there are no matches to derive it from.
 * - **A carry-over seed** (large positive), where TASO starts a split group on
 *   its parent's points and counts only the child's own matches.
 *
 * Only the first two are ours to add. The seed is already accounted for,
 * because a carry-over group is calculated over its parent's matches *and* its
 * own — adding it again would double-count. Subtracting the parent-derived
 * points rather than ignoring `starting_points` outright means a seeded group
 * that also carries a deduction still resolves correctly; no such group has
 * been observed, and this costs nothing to be right about.
 */
function adjustmentsFor(
  seasonMatches: MatchRow[],
  /** One group's rows. Keyed by team, so rows from another group would collide. */
  groupTeamRows: StoredGroupTeam[],
  entry: CarryOverEntry | null
): Map<number, number> {
  // Only a seeded entry has a parent contribution to discount; `entry` is
  // non-null inside this branch, so there is no parent to guess at.
  const parentPoints =
    entry?.seeded === true
      ? pointsFromGroup(seasonMatches, entry.parent)
      : new Map<number, number>();

  return new Map(
    groupTeamRows.map((row) => {
      const seed = parentPoints.get(row.teamProviderId) ?? 0;
      return [row.teamProviderId, (row.startingPoints ?? 0) - seed];
    })
  );
}

/**
 * Points each team earned in one group's own matches, unfiltered by round —
 * what a seeded `starting_points` encodes, so the two are comparable.
 */
function pointsFromGroup(seasonMatches: MatchRow[], groupId: number): Map<number, number> {
  const groupMatches = seasonMatches.filter((match) => match.groupId === groupId);
  return new Map(
    calculateStandings(toFinishedMatches(groupMatches), groupMatches).map((team) => [
      team.teamProviderId,
      team.points,
    ])
  );
}

/**
 * Whether our own calculation reproduces TASO's published points for every
 * team in the group.
 *
 * This is what decides how a group renders, replacing spec 009's shape
 * heuristic. Compared over the full season, never a filtered round, since
 * TASO's numbers are always the final ones.
 *
 * Checked in both directions, because each has its own failure. A team *we*
 * calculate that TASO does not list is not a disagreement — rosters and match
 * data can be briefly out of step, and TASO not mentioning a team is no
 * evidence we got it wrong. But a team TASO ranks that we do not produce means
 * our table is missing a row, and comparing only the teams we happen to have
 * would call that a match: every team we listed agreed, because the one that
 * disagreed was not there to check.
 */
function reproducesTasoPoints(standings: TeamStanding[], teamRows: StoredGroupTeam[]): boolean {
  // At least one row has points: `buildGroup` returns before calling this
  // when none does.
  const published = new Map(
    teamRows.flatMap((row) => (row.points === null ? [] : [[row.teamProviderId, row.points]]))
  );

  const calculated = new Set(standings.map((team) => team.teamProviderId));

  return (
    standings.every((team) => {
      const tasoPoints = published.get(team.teamProviderId);
      return tasoPoints === undefined || tasoPoints === team.points;
    }) && [...published.keys()].every((teamProviderId) => calculated.has(teamProviderId))
  );
}

/**
 * A knockout group has no points at all — confirmed live for all six such
 * groups across seasons 2015–2026 (2019's EL-lopputurnaus/EL-finaali,
 * 2022's Eurolopputurnaus/-finaali, 2023's and 2024's Eurolopputurnaus),
 * and for no league group in any season, where every team always has a
 * real `points` value.
 *
 * Note TASO **omits the field entirely** for these rows rather than
 * sending `null`, so an `=== null` test silently matches nothing. Both are
 * accepted here: `TasoGroupTeam.points` is `number | null | undefined`,
 * and only a real number means "this group keeps a table".
 *
 * Deliberately a positive test on TASO's own data rather than "every group
 * we can't own-calculate": that complement is only accurate while
 * `CARRY_OVER_CONFIG` is complete, and a future season that splits without
 * getting its entry would silently render two league groups as match
 * lists. See specs/010-playoff-group-match-list.md.
 */
function keepsATable(teamRows: StoredGroupTeam[]): boolean {
  // No rows at all means TASO has no table for this group — either a knockout
  // bracket, or a qualifying match whose group exists with zero teams until it
  // is played. Three of the latter exist in 2026. Both render as matches.
  if (teamRows.length === 0) return false;
  // A knockout group is not a points competition: TASO omits `points` for
  // every team rather than sending zeroes. A league group always has a real
  // number for every team.
  return teamRows.some((team) => team.points !== null);
}

/**
 * Every group TASO returns for the season, each rendered own-calculated
 * (via `calculateStandings`, including the parent group's matches for a
 * carry-over continuation group), pass-through (TASO's own precomputed
 * `getGroups` numbers), or playoff (its matches, no table). Ordered by
 * `group_id` ascending — `phase_number` is confirmed unreliable for
 * ordering.
 */
/**
 * Every group's rendering for the whole season, before any round filter.
 *
 * Shared by `getSeasonStandings` and `listSeasonRounds` so the two cannot
 * disagree about which groups respond to a round — offering a round for a
 * group that ignores it is a selector that does nothing when used. Wrapped in
 * `cache()` so asking both questions in one request classifies once; the
 * underlying reads are already deduplicated the same way.
 */
const classifySeasonGroups = cache(async function classifySeasonGroups(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<
  | { status: "ok"; matches: MatchRow[]; groups: GroupStandingsResult[] }
  | { status: "empty" | "error" }
> {
  const [{ matches: seasonMatches, refreshFailed }, teamRows] = await Promise.all([
    getSyncedSeasonMatches(categoryId, competitionId, seasonId, activeSeasonId),
    getSyncedGroupTeams(categoryId, competitionId, seasonId, activeSeasonId),
  ]);

  if (seasonMatches.length === 0) {
    return refreshFailed ? { status: "error" } : { status: "empty" };
  }

  if (teamRows.length === 0) {
    logger.warn(
      { categoryId, competitionId, seasonId },
      "No stored TASO group standings; calculating without starting_points adjustments"
    );
  }

  const groups = groupIdsIn(seasonMatches)
    .sort((left, right) => left - right)
    .map((groupId) => buildGroup(seasonMatches, teamRows, categoryId, competitionId, groupId));

  return { status: "ok", matches: seasonMatches, groups };
});

export async function getSeasonStandings(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number,
  round: number | undefined
): Promise<SeasonStandingsResult> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") return { status: classified.status, groups: [] };
    if (round === undefined) return { status: "ok", groups: classified.groups };

    // Only an own-calculated group responds to a round; the classification
    // itself does not change with one, so it is reused rather than redone.
    const teamRows = await getSyncedGroupTeams(categoryId, competitionId, seasonId, activeSeasonId);
    const groups = classified.groups.map((group) =>
      group.kind === "own-calculated"
        ? {
            ...group,
            standings: ownCalculatedStandings(
              classified.matches,
              groupTeamsFor(teamRows, group.groupId),
              categoryId,
              competitionId,
              group.groupId,
              round
            ),
          }
        : group
    );

    return { status: "ok", groups };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to load TASO standings"
    );
    return { status: "error", groups: [] };
  }
}

/**
 * One group's rendering, decided in this order:
 *
 * 1. No table at all — knockout, or a group TASO lists with no teams — so its
 *    matches are its standings.
 * 2. Our calculation reproduces TASO's published points, so the table is ours
 *    and carries a round selector.
 * 3. It does not, so TASO's own numbers are shown instead, with no round
 *    selector and a notice on the page.
 *
 * Step 3 is what keeps spec 009's guarantee that an unvalidated group never
 * renders silently wrong points, now that no shape heuristic identifies one.
 */
function buildGroup(
  seasonMatches: MatchRow[],
  allTeamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string,
  groupId: number
): GroupStandingsResult {
  const groupName = groupNameOf(seasonMatches, groupId);
  const teamRows = groupTeamsFor(allTeamRows, groupId);
  // Whether TASO's groups are known for this season *at all*. Without that
  // distinction, an unreachable `getGroups` with nothing yet stored would make
  // every group look team-less and turn the whole season into match lists.
  const seasonHasGroupData = allTeamRows.length > 0;

  if (seasonHasGroupData && !keepsATable(teamRows)) {
    return {
      kind: "match-list",
      groupId,
      groupName,
      // Chronological, like every other match list in the app. The two-legged
      // finals' aggregate rows are already absent: TASO marks them by leaving
      // date/time empty, so they are skipped at normalization and never
      // stored.
      matches: selectGroupMatches(seasonMatches, groupId),
    };
  }

  // Always the full season: a round filter changes an own-calculated group's
  // numbers but never its classification, so `getSeasonStandings` applies one
  // afterwards rather than reclassifying per round.
  const fullSeason = ownCalculatedStandings(
    seasonMatches,
    teamRows,
    categoryId,
    competitionId,
    groupId,
    undefined
  );

  // Nothing to check ourselves against. Own-calculate rather than fall back to
  // numbers we do not have: every adjustment is zero here, which is already
  // correct for the majority of groups that have none, and a stale-but-real
  // table beats an empty one. See specs/013-more-finnish-competitions.md.
  if (!teamRows.some((row) => row.points !== null)) {
    return {
      kind: "own-calculated",
      groupId,
      groupName,
      standings: fullSeason,
    };
  }

  if (!reproducesTasoPoints(fullSeason, teamRows)) {
    return {
      kind: "pass-through",
      groupId,
      groupName,
      // TASO's own order, since these are TASO's own numbers. A row it never
      // ranked sorts last, in the order TASO listed it — sorting those to the
      // top on a 0 would put an unranked team above the group winner.
      standings: [...teamRows]
        .sort(
          (left, right) =>
            (publishedPosition(left) ?? UNRANKED) - (publishedPosition(right) ?? UNRANKED)
        )
        // Called explicitly rather than passed by reference: `map` supplies a
        // third argument this takes no account of, and the index it does use
        // is deliberate, not an accident.
        .map((team, index) => toPassThroughStanding(team, index)),
    };
  }

  return {
    kind: "own-calculated",
    groupId,
    groupName,
    standings: fullSeason,
  };
}

/** Every match for the season, across every group, sorted by kickoff time. */
export async function getSeasonMatchList(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }
    return {
      status: "ok",
      matches: [...seasonMatches].sort(
        (left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime()
      ),
    };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to load TASO season matches"
    );
    return { status: "error" };
  }
}

/** A team's matches for the season, across every group it appeared in, chronologically. */
export async function getTeamMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }

    const teamMatches = selectTeamMatches(seasonMatches, teamProviderId);

    if (teamMatches.length === 0) return { status: "not_found" };
    return { status: "ok", matches: teamMatches };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId, teamProviderId },
      "Unable to load TASO team matches"
    );
    return { status: "error" };
  }
}

/**
 * Every round_id present across the season's own-calculated groups,
 * ascending — one shared, continuous round scale for the whole page's round
 * selector (matches the existing single-selector `StandingsControls`
 * pattern), not a per-group 1..max range. A continuation group's own rounds
 * naturally start above 1 (e.g. Mestaruussarja's own matches begin at round
 * 23) since round_id is never re-indexed per group.
 */
export function listSelectableTasoRounds(
  matchList: MatchRow[],
  tableGroupIds: Set<number>
): number[] {
  const rounds = matchList
    .filter((match) => match.matchday !== null && tableGroupIds.has(match.groupId))
    .map((match) => match.matchday as number);
  return [...new Set(rounds)].sort((left, right) => left - right);
}

/**
 * The rounds a page's selector offers, for the season as a whole.
 *
 * Groups with no table are excluded, and that is not cosmetic: Veikkausliiga
 * 2022's Eurolopputurnausfinaali numbers its rounds from **0**, so including
 * it would put a "Kierros 0" in the selector that filters nothing.
 *
 * Reads the same two cached sources as `getSeasonStandings`, so asking for the
 * rounds before the standings costs no extra fetch.
 */
export async function listSeasonRounds(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<number[]> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") return [];

    // Own-calculated only. A match-list group has no table to filter, and a
    // pass-through group shows TASO's final numbers whatever round is picked —
    // offering either group's rounds would put entries in the selector that
    // visibly do nothing.
    const roundedGroupIds = new Set(
      classified.groups
        .filter((group) => group.kind === "own-calculated")
        .map((group) => group.groupId)
    );
    return listSelectableTasoRounds(classified.matches, roundedGroupIds);
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to list TASO rounds; offering none"
    );
    return [];
  }
}

export type TasoRoundParamResult =
  | { kind: "absent" }
  | { kind: "valid"; round: number }
  | { kind: "invalid" };

const POSITIVE_INTEGER = /^\d+$/;

/**
 * Validates the `kierros` query parameter against the actual round numbers
 * `listSelectableTasoRounds` returned — a membership check, not a 1..max
 * range check, since TASO's round scale can start above 1 for a
 * continuation-only group and isn't guaranteed gap-free.
 */
export function parseTasoRoundParam(
  rawValue: string | string[] | undefined,
  availableRounds: number[]
): TasoRoundParamResult {
  if (rawValue === undefined || rawValue === "") return { kind: "absent" };
  if (typeof rawValue !== "string" || !POSITIVE_INTEGER.test(rawValue)) return { kind: "invalid" };

  const round = Number(rawValue);
  return availableRounds.includes(round) ? { kind: "valid", round } : { kind: "invalid" };
}
