import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { matches, tasoGroupTeams, tasoMatches } from "@/db/schema";
import { invalidateCache } from "@/lib/cache";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  earliestSeasonFor,
} from "@/lib/domestic-competitions";
import { listSelectableTasoSeasons } from "@/lib/domestic-page-context";
import {
  footballDataMatchesCacheKey,
  getSeasonMatches as getForeignSeasonMatches,
  getSeasonContext,
  type NormalizedProviderMatch,
} from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { competitionNameFor, isKnownCompetition } from "@/lib/refresh-competitions";
import {
  type DiffableGroupTeam,
  type DiffableProviderMatch,
  type DiffableStoredMatch,
  diffGroupTeams,
  diffMatches,
  snapshotHash,
} from "@/lib/refresh-diff";
import { recordFailure, recordSuccess } from "@/lib/refresh-runs";
import type {
  ApplyResult,
  CompetitionChoice,
  PreviewResult,
  RefreshPreview,
  SeasonChoice,
  SeasonsResult,
} from "@/lib/refresh-view";
import {
  standingsCacheKey,
  storedForeignSeasons,
  synchronizeMatches as synchronizeForeignMatches,
} from "@/lib/standings-service";
import {
  getSeasonGroups,
  getSeasonMatches as getTasoSeasonMatches,
  type NormalizedTasoGroupTeam,
  type NormalizedTasoMatch,
  normalizeGroupTeams,
  tasoCategoryCacheKey,
  tasoMatchesCacheKey,
} from "@/lib/taso";
import {
  dedupeByIdentity,
  resolveTasoSeasonCeiling,
  storedTasoSeasons,
  synchronizeGroupTeams,
  synchronizeMatches as synchronizeTasoMatches,
} from "@/lib/taso-standings-service";

/**
 * Forced refresh of one competition-season, from
 * specs/029-forced-season-refresh.md.
 *
 * Two steps, deliberately. `previewRefresh` fetches and compares and writes
 * **nothing**; `applyRefresh` writes only the diff an admin approved. The split
 * is not politeness — it is the only thing standing between a truncated
 * provider response and a deleted season, because nothing in a partial answer
 * distinguishes it from a season that genuinely lost fixtures. A person looks
 * at the removals and decides.
 *
 * The rule this module is built around:
 *
 * > A provider that goes silent must never cost us data. A provider that
 * > answers may correct us, but only with a person's consent.
 *
 * So an empty answer for a season we hold rows for is refused outright, before
 * anything can touch the database, and every non-empty answer is shown before
 * it is applied.
 */

/**
 * The seasons this competition offers, from the same helpers the reader-facing
 * pickers use.
 *
 * No new season-discovery machinery: new seasons arrive through the ordinary
 * sync, and this tool only ever refreshes a season the app already knows about.
 *
 * Loaded per competition rather than for all of them at once. There are ten
 * foreign competitions and `getSeasonContext` is per competition, so resolving
 * every one on page load would turn a cold Redis into ten requests against a
 * rate-limited plan.
 */
export async function listSeasonsFor(choice: CompetitionChoice): Promise<SeasonsResult> {
  if (!isKnownCompetition(choice)) return { ok: false, reason: "input" };

  // **Read separately from the provider calls below**, so its failure is
  // reported as `"read"` rather than `"provider"`. One `try` around both would
  // tell an operator their provider is down when their database is, sending
  // them to the wrong system — the exact distinction `"read"` was added for.
  //
  // Narrowed to seasons we already hold: the provider's range includes seasons
  // this app has never stored, and offering one would let the tool *import* a
  // season, which the ordinary sync is for. There is also nothing to correct in
  // a season we hold nothing for.
  let stored: Set<number>;
  try {
    stored = await storedSeasonsFor(choice);
  } catch (error) {
    logger.error({ err: error, ...choice }, "Reading which seasons are stored failed");
    return { ok: false, reason: "read" };
  }
  const held = (seasons: SeasonChoice[]) => seasons.filter((season) => stored.has(season.seasonId));

  try {
    if (choice.source === "taso") {
      // `resolveTasoSeasonCeiling`, never `resolveTasoSeasonContext`. The
      // latter probes by synchronizing the current season, which *writes* — so
      // merely previewing would have mutated current-season rows before an
      // admin had approved anything, breaking this engine's one promise. Found
      // in review, not by me.
      const { currentSeason } = await resolveTasoSeasonCeiling(choice.code);
      return {
        ok: true,
        seasons: held(listSelectableTasoSeasons(currentSeason, earliestSeasonFor(choice.code))),
      };
    }
    const { selectableSeasons } = await getSeasonContext(choice.code);
    return { ok: true, seasons: held(selectableSeasons) };
  } catch (error) {
    logger.warn({ err: error, ...choice }, "Listing seasons for a forced refresh failed");
    return { ok: false, reason: "provider" };
  }
}

/**
 * Every season this app has rows for, in one competition.
 *
 * Dispatches to the service that owns the tables rather than querying them
 * here. This module orchestrates a refresh; which columns answer "what do we
 * hold" is the standings services' business, and keeping a second copy of that
 * rule here is how the ceiling and the season list came to disagree.
 */
async function storedSeasonsFor(choice: CompetitionChoice): Promise<Set<number>> {
  return choice.source === "taso"
    ? await storedTasoSeasons(choice.code)
    : await storedForeignSeasons(choice.code);
}

function seasonLabelFor(seasons: SeasonChoice[], seasonId: number): string | null {
  return seasons.find((season) => season.seasonId === seasonId)?.label ?? null;
}

/**
 * What one provider answered for one season, alongside the identifiers the
 * rows are stored under.
 *
 * A discriminated union rather than a common interface: the two providers do
 * not store the same things — TASO has group standings carrying
 * `starting_points` and football-data has none — and flattening that into an
 * optional field would make every read site guess.
 */
type Snapshot =
  | {
      source: "taso";
      competitionId: string;
      categoryId: string;
      matches: NormalizedTasoMatch[];
      groupTeams: NormalizedTasoGroupTeam[];
    }
  | {
      source: "football-data";
      /** Carried so the write can re-read the stored rows without the choice. */
      competitionCode: string;
      matches: NormalizedProviderMatch[];
    };

/**
 * The Redis entries that have to go before a refetch.
 *
 * Two rules decide the list: an entry is cleared when it caches *the answer
 * being refetched* or *a value computed from it*, and left alone when it
 * caches which seasons or names exist. So `taso:season-context`,
 * `taso:categories` and `football-data:competition` stay — a refresh does not
 * change which seasons a competition has.
 *
 * Every key comes from the builder in the module that owns it, never from a
 * literal spelled out again here: a key written in two places is a key that
 * can change in one, and the resulting failure is silent — the refetch simply
 * answers out of the cache this run exists to bypass.
 */
export function cacheKeysFor(choice: CompetitionChoice, seasonId: number): string[] {
  if (choice.source === "taso") {
    const competitionId = competitionIdForSeason(choice.code, seasonId);
    const categoryId = categoryIdForSeason(choice.code, seasonId);
    return [
      tasoMatchesCacheKey(competitionId, categoryId),
      tasoCategoryCacheKey(competitionId, categoryId),
    ];
  }
  return [
    footballDataMatchesCacheKey(choice.code, seasonId),
    // The *computed* table. Easy to miss and expensive to miss: the write
    // succeeds, so without this the page serves the old standings for up to
    // fifteen minutes after the database is already right.
    standingsCacheKey(choice.code, seasonId),
  ];
}

async function clearCaches(keys: string[]): Promise<boolean> {
  const cleared = await Promise.all(keys.map((key) => invalidateCache(key)));
  return cleared.every(Boolean);
}

async function fetchSnapshot(choice: CompetitionChoice, seasonId: number): Promise<Snapshot> {
  if (choice.source === "taso") {
    // Derived exactly as `domestic-page-context.ts` derives them, so the rows
    // compared are the rows the page reads. `competitionIdFromSeason` from
    // taso.ts would answer the season umbrella for Ykkösliigacup and quietly
    // compare against rows no page ever shows.
    const competitionId = competitionIdForSeason(choice.code, seasonId);
    const categoryId = categoryIdForSeason(choice.code, seasonId);
    const [providerMatches, groups] = await Promise.all([
      getTasoSeasonMatches(competitionId, categoryId, seasonId),
      getSeasonGroups(competitionId, categoryId),
    ]);
    return {
      source: "taso",
      competitionId,
      categoryId,
      matches: providerMatches,
      groupTeams: normalizeGroupTeams(groups, categoryId, competitionId, seasonId),
    };
  }
  return {
    source: "football-data",
    competitionCode: choice.code,
    matches: await getForeignSeasonMatches(choice.code, seasonId),
  };
}

/**
 * Reads what we hold, computes the difference, and returns it — writing
 * nothing.
 *
 * Branched per source rather than unified behind a common row type. The two
 * providers genuinely store different things: TASO has group standings
 * carrying `starting_points` and football-data has none, and the two match
 * tables have different columns. A shared abstraction here would have to
 * describe the union of both, which is a shape neither provider actually has.
 */
/** The group rows as the writer will actually store them. */
function dedupedGroupTeams(snapshot: Extract<Snapshot, { source: "taso" }>) {
  return dedupeByIdentity(snapshot.groupTeams);
}

/**
 * The rows we currently hold, read through whichever executor is given — the
 * database when a diff is being computed, the transaction when the write is
 * about to happen.
 */
async function readStoredTaso(
  executor: Executor,
  snapshot: Extract<Snapshot, { source: "taso" }>,
  seasonId: number
) {
  return await Promise.all([
    executor
      .select()
      .from(tasoMatches)
      .where(
        and(
          eq(tasoMatches.categoryId, snapshot.categoryId),
          eq(tasoMatches.competitionCode, snapshot.competitionId),
          eq(tasoMatches.seasonId, seasonId)
        )
      ),
    executor
      .select()
      .from(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, snapshot.categoryId),
          eq(tasoGroupTeams.competitionCode, snapshot.competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      ),
  ]);
}

async function readStoredForeign(executor: Executor, competitionCode: string, seasonId: number) {
  return await executor
    .select()
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
}

/**
 * What we currently hold for this season, through whichever executor is given
 * — the database while a diff is being computed, the transaction when the write
 * is about to happen.
 *
 * `groupTeams` is null for football-data, which stores no group standings:
 * "this table does not exist for this provider" is a different statement from
 * "it is empty", and every rule below reads it that way.
 */
async function readStored(
  executor: Executor,
  snapshot: Snapshot,
  seasonId: number
): Promise<StoredRows> {
  if (snapshot.source !== "taso") {
    return { matches: await readStoredForeign(executor, snapshot.competitionCode, seasonId) };
  }
  const [matches, groupTeams] = await readStoredTaso(executor, snapshot, seasonId);
  return { matches, groupTeams };
}

type StoredRows = {
  matches: DiffableStoredMatch[];
  /** Absent for football-data, which has no group standings table. */
  groupTeams?: DiffableGroupTeam[];
};

/**
 * The whole comparison, in one pure function: is the provider silent, what
 * would change, and what fingerprint does this pairing have.
 *
 * **Pure, and used twice.** The preview calls it against rows read from the
 * database; the write calls it again against rows read inside its own
 * transaction. That is what makes a stale bounce honest — the diff an admin is
 * shown afterwards describes the rows that are actually there, not the ones
 * that were there when they pressed the button.
 *
 * It was two functions with a shared shape before, and every seam between them
 * cost a review round: the silence guard was right in one and wrong in the
 * other, the dedupe was applied in one place and not the next, and the hash was
 * spelled out at each call site. One rule, one place.
 */
function compare(
  snapshot: Snapshot,
  stored: StoredRows,
  resolved: Resolved
): { ok: true; computed: Computed } | { ok: false; reason: "empty"; storedRows: number } {
  const storedGroupTeams = stored.groupTeams ?? [];
  const providerGroupTeams = snapshot.source === "taso" ? dedupedGroupTeams(snapshot) : [];

  // **Per table, not across both.** An `&&` reads as the same rule and is not:
  // TASO answering with matches but no group standings would walk past it, and
  // `synchronizeGroupTeams` deletes before it inserts — so a completed season's
  // standings would be destroyed by a run that looked successful. Each table is
  // silent or not on its own evidence.
  const matchesSilent = snapshot.matches.length === 0 && stored.matches.length > 0;
  const groupsSilent =
    stored.groupTeams !== undefined &&
    providerGroupTeams.length === 0 &&
    storedGroupTeams.length > 0;
  if (matchesSilent || groupsSilent) {
    return {
      ok: false,
      reason: "empty",
      storedRows: stored.matches.length + storedGroupTeams.length,
    };
  }

  // The type arguments are spelled out because `snapshot.matches` is a union of
  // the two providers' row types, and inference would pick one of them and
  // reject the other. Both satisfy `DiffableProviderMatch`, which is all the
  // diff needs.
  const matchDiff = diffMatches<DiffableStoredMatch, DiffableProviderMatch>(
    stored.matches,
    snapshot.matches
  );
  // The provider's group rows are deduplicated with the writer's own rule
  // before being diffed *and* before being hashed. A knockout group returns one
  // row per bracket slot, so a team that advances appears several times and
  // `synchronizeGroupTeams` keeps only the first — counting the rest would
  // promise an admin more inserts than the apply performs.
  const groupDiff =
    stored.groupTeams === undefined ? null : diffGroupTeams(storedGroupTeams, providerGroupTeams);

  return {
    ok: true,
    computed: {
      snapshot,
      removedIds: matchDiff.removed.map((match) => match.providerMatchId),
      preview: {
        ...previewShell(resolved),
        matches: matchDiff.counts,
        // Null rather than zeroes for football-data: "none exist" is a
        // different statement from "none changed".
        groupRows: groupDiff?.counts ?? null,
        deductionChanges: groupDiff?.deductionChanges ?? [],
        removedMatches: matchDiff.removed,
        snapshotHash: snapshotHashOf(snapshot, stored.matches, storedGroupTeams),
      },
    },
  };
}

/**
 * The fingerprint an approval is made of: the provider's answer **and** the
 * rows it was compared against.
 *
 * Hashing only the provider would leave the stored side free to move, and the
 * apply would still accept an approval built against rows that are gone —
 * removing matches by name that the admin was never shown.
 */
function snapshotHashOf(
  snapshot: Snapshot,
  storedMatches: readonly object[],
  storedGroupTeams: readonly object[]
): string {
  return snapshot.source === "taso"
    ? snapshotHash([snapshot.matches, dedupedGroupTeams(snapshot), storedMatches, storedGroupTeams])
    : snapshotHash([snapshot.matches, storedMatches]);
}

function previewShell(resolved: Resolved) {
  return {
    source: resolved.choice.source,
    competitionCode: resolved.choice.code,
    competitionName: resolved.competitionName,
    seasonId: resolved.seasonId,
    seasonLabel: resolved.seasonLabel,
  };
}

type Resolved = {
  choice: CompetitionChoice;
  seasonId: number;
  seasonLabel: string;
  competitionName: string;
};

/**
 * Validates the competition and the season against the registries and the
 * competition's own freshly resolved range.
 *
 * Both entry points run this, and the apply runs it again rather than trusting
 * anything the preview handed to the browser: a server action is a public
 * endpoint, and its arguments arrive from the client whatever rendered them.
 */
async function resolve(
  choice: CompetitionChoice,
  seasonId: number
): Promise<Resolved | { reason: "input" | "provider" | "read" }> {
  if (!isKnownCompetition(choice)) return { reason: "input" };
  if (!Number.isInteger(seasonId)) return { reason: "input" };

  // The reason is carried, not flattened. `listSeasonsFor` can fail because the
  // provider would not say which seasons exist, or because our own database
  // would not — and collapsing both to `"provider"` here would undo the
  // distinction one line after making it, sending an operator to the wrong
  // system. Its `"input"` case is already ruled out above.
  const seasons = await listSeasonsFor(choice);
  if (!seasons.ok) return { reason: seasons.reason === "read" ? "read" : "provider" };

  const seasonLabel = seasonLabelFor(seasons.seasons, seasonId);
  if (seasonLabel === null) return { reason: "input" };

  return { choice, seasonId, seasonLabel, competitionName: competitionNameFor(choice) };
}

function isResolved(value: Resolved | { reason: string }): value is Resolved {
  return "seasonLabel" in value;
}

type Computed = { preview: RefreshPreview; snapshot: Snapshot; removedIds: number[] };

type DiffOutcome =
  | { ok: true; computed: Computed }
  | {
      ok: false;
      reason: "cache" | "provider" | "empty" | "read";
      storedRows?: number | undefined;
    };

/**
 * Clears the caches, fetches, and diffs — the shared half of both entry points.
 *
 * The `"empty"` refusal inside the per-source diffs is the feature's core rule:
 * a provider answering with nothing, for a season we hold rows for, must not
 * reach a writer. It is refused here rather than guarded inside the writer,
 * because the writer is shared with the ordinary sync — where deleting a
 * dropped team is exactly right.
 */
async function computeDiff(resolved: Resolved, bypassCache: boolean): Promise<DiffOutcome> {
  const { choice, seasonId } = resolved;

  // **The preview clears; the apply does not.**
  //
  // Clearing is how the preview reaches the provider at all, and a clear that
  // failed means the refetch would come back out of the very cache this run
  // exists to bypass — so the run stops rather than showing an admin a diff
  // built from the data they are trying to correct.
  //
  // The apply then reads back through the entry the preview just warmed, which
  // is what makes "what you saw is what you applied" the ordinary case rather
  // than a race: inside the fifteen-minute window it is the same bytes, so the
  // hash matches and no second provider call is made. Past the window it
  // refetches, and the hash check turns a changed answer into a refusal
  // instead of a surprise.
  if (bypassCache && !(await clearCaches(cacheKeysFor(choice, seasonId)))) {
    return { ok: false, reason: "cache" };
  }

  let snapshot: Snapshot;
  try {
    snapshot = await fetchSnapshot(choice, seasonId);
  } catch (error) {
    logger.warn({ err: error, ...choice, seasonId }, "Forced refresh could not reach the provider");
    return { ok: false, reason: "provider" };
  }

  // Reading what we already hold can fail too, and a failure here must not
  // escape as a 500: the caller is a server action answering a client
  // component, so a throw arrives as a generic browser error with nothing an
  // admin can act on. It is its own reason rather than folded into
  // `"provider"` — the provider answered fine, our database did not — and the
  // distinction is the one an operator needs to know which system to look at.
  let outcome: ReturnType<typeof compare>;
  try {
    outcome = compare(snapshot, await readStored(db, snapshot, seasonId), resolved);
  } catch (error) {
    logger.error(
      { err: error, ...choice, seasonId },
      "Forced refresh could not read what is currently stored"
    );
    return { ok: false, reason: "read" };
  }

  if (!outcome.ok) {
    logger.warn(
      { ...choice, seasonId, storedRows: outcome.storedRows },
      "Forced refresh refused: the provider answered with nothing for a season we hold"
    );
  }
  return outcome;
}

export async function previewRefresh(
  choice: CompetitionChoice,
  seasonId: number
): Promise<PreviewResult> {
  const resolved = await resolve(choice, seasonId);
  if (!isResolved(resolved)) return { ok: false, reason: resolved.reason };

  const diff = await computeDiff(resolved, true);
  if (!diff.ok) return { ok: false, reason: diff.reason, storedRows: diff.storedRows };

  return { ok: true, preview: diff.computed.preview };
}

/**
 * Writes the diff — and only the diff the admin was shown.
 *
 * The hash is recomputed from a fresh fetch and compared to the one the preview
 * issued. A mismatch means the provider's answer moved between the two steps,
 * so the apply refuses and hands back the new preview instead of writing
 * something nobody approved.
 */
export async function applyRefresh(
  choice: CompetitionChoice,
  seasonId: number,
  expectedHash: string,
  adminId: string
): Promise<ApplyResult> {
  const resolved = await resolve(choice, seasonId);
  if (!isResolved(resolved)) {
    // A provider that cannot say which seasons exist is an attempted run that
    // failed, so it belongs in the log. `"input"` still does not: a request
    // naming a competition or season this app does not have is malformed
    // rather than an event that happened to the data.
    if (resolved.reason !== "input") {
      await recordFailure(choice, seasonId, resolved.reason, adminId);
    }
    return { ok: false, reason: resolved.reason };
  }

  const diff = await computeDiff(resolved, false);
  if (!diff.ok) {
    await recordFailure(choice, seasonId, diff.reason, adminId, resolved.seasonLabel);
    return { ok: false, reason: diff.reason };
  }

  const { preview, snapshot, removedIds } = diff.computed;
  if (preview.snapshotHash !== expectedHash) {
    return { ok: false, reason: "stale", preview };
  }

  try {
    // The check above is against rows read *before* the transaction opens, so
    // on its own it is a time-of-check/time-of-use gap: another writer could
    // change the season in between and this apply would overwrite them with an
    // approval that no longer describes anything. `writeSnapshot` re-checks
    // inside the transaction and writes nothing when it no longer holds.
    //
    // It hands back the diff computed from the transaction's own rows, which is
    // the one the admin has to see — `preview` here describes rows that are no
    // longer stored.
    const written = await writeSnapshot(snapshot, seasonId, removedIds, expectedHash, resolved);
    if (!written.ok) return { ok: false, reason: "stale", preview: written.preview };
  } catch (error) {
    logger.error({ err: error, ...choice, seasonId, adminId }, "Forced refresh failed to write");
    await recordFailure(choice, seasonId, "write", adminId, resolved.seasonLabel);
    return { ok: false, reason: "write" };
  }

  await recordSuccess(preview, adminId);
  return { ok: true, applied: preview };
}

/**
 * One transaction per run, so a half-applied season is not a state this can
 * produce.
 *
 * The writers are the ordinary ones, unchanged. `synchronizeGroupTeams`
 * deletes before inserting, and that is correct *here* for the same reason it
 * is correct in the ordinary sync — it only ever runs against a non-empty
 * answer, which `computeDiff` has already established and an admin has already
 * approved.
 *
 * The match deletion is this feature's own: `synchronizeMatches` upserts and
 * never deletes, so a match the provider has withdrawn would otherwise linger.
 * It removes exactly the rows the preview listed by id — never a predicate over
 * the season, which would widen with the next row somebody inserts.
 */
async function writeSnapshot(
  snapshot: Snapshot,
  seasonId: number,
  removedIds: number[],
  expectedHash: string,
  resolved: Resolved
): Promise<{ ok: true } | { ok: false; preview: RefreshPreview | undefined }> {
  return await db.transaction(
    async (tx) => {
      // **Re-checked here, not only before the transaction.** The approval was
      // computed from rows read outside it, so between that read and this write
      // another forced apply — or the ordinary sync on a current season — could
      // have moved them. Running the same comparison against rows read through
      // `tx` closes that window: an approval that no longer describes what is
      // stored writes nothing.
      //
      // It is the same `compare` the preview used, so the diff handed back on a
      // mismatch is a real one describing the rows that are there *now* —
      // returning the caller's obsolete preview would show an admin a diff of
      // rows that no longer exist and invite them to approve it again.
      //
      // `undefined` only when the provider has meanwhile gone silent on a
      // season we hold, which `compare` refuses outright and which no diff can
      // describe.
      const current = compare(snapshot, await readStored(tx, snapshot, seasonId), resolved);
      if (!current.ok) return { ok: false, preview: undefined };
      if (current.computed.preview.snapshotHash !== expectedHash) {
        return { ok: false, preview: current.computed.preview };
      }

      if (snapshot.source === "taso") {
        // `tx`, not the module-level `db`. Without it each writer commits on its
        // own connection while this function claims atomicity — so a group
        // replacement could commit and a later deletion fail, leaving the season
        // half applied. Caught in review, not by me.
        await synchronizeTasoMatches(snapshot.matches, tx);
        await synchronizeGroupTeams(
          snapshot.categoryId,
          snapshot.competitionId,
          seasonId,
          snapshot.groupTeams,
          tx
        );
        if (removedIds.length > 0) {
          await tx.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, removedIds));
        }
        return { ok: true };
      }

      await synchronizeForeignMatches(snapshot.matches, tx);
      if (removedIds.length > 0) {
        await tx.delete(matches).where(inArray(matches.providerMatchId, removedIds));
      }
      return { ok: true };
    },
    {
      /**
       * Serializable, like `scripts/grant-admin-run.ts`. Re-reading inside the
       * transaction is not enough under read-committed — a concurrent commit
       * between that read and our write would still be missed — and this runs a
       * handful of times a year, so the cost of the strictest level is nothing
       * against the cost of overwriting somebody's correction.
       */
      isolationLevel: "serializable",
    }
  );
}
