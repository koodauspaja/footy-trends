import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matches, tasoGroupTeams, tasoMatches } from "@/db/schema";
import { invalidateCache } from "@/lib/cache";
import {
  categoryIdForSeason,
  categoryIdsFor,
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
import { diffGroupTeams, diffMatches, snapshotHash } from "@/lib/refresh-diff";
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

  try {
    // Narrowed to seasons we already hold. The provider's range is the wrong
    // list on its own: it includes seasons this app has never stored, and
    // offering one would let the tool *import* a season — which the ordinary
    // sync is for, and which this spec puts out of scope. There is also nothing
    // to correct in a season we hold nothing for, so the entry would be a trap
    // rather than a feature.
    const stored = await storedSeasonsFor(choice);
    const held = (seasons: SeasonChoice[]) =>
      seasons.filter((season) => stored.has(season.seasonId));

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
 * Both TASO tables, because a season can hold group standings without matches
 * or the reverse, and either is something an admin might need to correct.
 * Scoped by category rather than by competition id, matching
 * `newestStoredSeason`: a junior competition's rows are split across two or
 * three category ids by era, and asking about one would hide the others.
 */
async function storedSeasonsFor(choice: CompetitionChoice): Promise<Set<number>> {
  if (choice.source !== "taso") {
    const rows = await db
      .selectDistinct({ seasonId: matches.seasonId })
      .from(matches)
      .where(eq(matches.competitionCode, choice.code));
    return new Set(rows.map((row) => row.seasonId));
  }

  const categoryIds = categoryIdsFor(choice.code);
  const [matchSeasons, groupSeasons] = await Promise.all([
    db
      .selectDistinct({ seasonId: tasoMatches.seasonId })
      .from(tasoMatches)
      .where(inArray(tasoMatches.categoryId, categoryIds)),
    db
      .selectDistinct({ seasonId: tasoGroupTeams.seasonId })
      .from(tasoGroupTeams)
      .where(inArray(tasoGroupTeams.categoryId, categoryIds)),
  ]);
  return new Set([...matchSeasons, ...groupSeasons].map((row) => row.seasonId));
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
  | { source: "football-data"; matches: NormalizedProviderMatch[] };

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

async function tasoDiff(
  snapshot: Extract<Snapshot, { source: "taso" }>,
  seasonId: number,
  resolved: Resolved
): Promise<{ ok: true; computed: Computed } | { ok: false; reason: "empty"; storedRows: number }> {
  const scope = and(
    eq(tasoMatches.categoryId, snapshot.categoryId),
    eq(tasoMatches.competitionCode, snapshot.competitionId),
    eq(tasoMatches.seasonId, seasonId)
  );
  const [storedMatches, storedGroupTeams] = await Promise.all([
    db.select().from(tasoMatches).where(scope),
    db
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

  // **Per table, not across both.** An `&&` here reads as the same rule and is
  // not: TASO answering with matches but no group standings would have walked
  // past it, and `synchronizeGroupTeams` deletes before it inserts — so a
  // completed season's standings would be destroyed by a run that looked
  // successful. Each table is silent or not on its own evidence.
  const matchesSilent = snapshot.matches.length === 0 && storedMatches.length > 0;
  const groupsSilent = snapshot.groupTeams.length === 0 && storedGroupTeams.length > 0;
  if (matchesSilent || groupsSilent) {
    return {
      ok: false,
      reason: "empty",
      storedRows: storedMatches.length + storedGroupTeams.length,
    };
  }

  const matchDiff = diffMatches(storedMatches, snapshot.matches);
  // Deduplicated with the writer's own rule before diffing *and* before
  // hashing. A knockout group returns one row per bracket slot, so a team that
  // advances appears several times; `synchronizeGroupTeams` keeps the first and
  // drops the rest. Counting the raw rows would promise an admin more inserts
  // than the apply performs, and record that promise in the audit log.
  const groupDiff = diffGroupTeams(storedGroupTeams, dedupedGroupTeams(snapshot));

  return {
    ok: true,
    computed: {
      snapshot,
      removedIds: matchDiff.removed.map((match) => match.providerMatchId),
      preview: {
        ...previewShell(resolved),
        matches: matchDiff.counts,
        groupRows: groupDiff.counts,
        deductionChanges: groupDiff.deductionChanges,
        removedMatches: matchDiff.removed,
        // **Both sides.** The provider's answer *and* the rows it was compared
        // against. Hashing only the provider would let the stored side move —
        // another admin applying, or the ordinary sync touching a current
        // season — and the apply would still accept an approval built against
        // rows that are gone, removing matches by name that an admin never saw
        // listed. Either side moving now re-previews instead.
        snapshotHash: snapshotHash([
          snapshot.matches,
          dedupedGroupTeams(snapshot),
          storedMatches,
          storedGroupTeams,
        ]),
      },
    },
  };
}

async function foreignDiff(
  snapshot: Extract<Snapshot, { source: "football-data" }>,
  seasonId: number,
  resolved: Resolved
): Promise<{ ok: true; computed: Computed } | { ok: false; reason: "empty"; storedRows: number }> {
  const storedMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.competitionCode, resolved.choice.code), eq(matches.seasonId, seasonId)));

  if (snapshot.matches.length === 0 && storedMatches.length > 0) {
    return { ok: false, reason: "empty", storedRows: storedMatches.length };
  }

  const matchDiff = diffMatches(storedMatches, snapshot.matches);

  return {
    ok: true,
    computed: {
      snapshot,
      removedIds: matchDiff.removed.map((match) => match.providerMatchId),
      preview: {
        ...previewShell(resolved),
        matches: matchDiff.counts,
        // Null rather than zeroes: football-data stores no group standings, and
        // "none exist" is a different statement from "none changed".
        groupRows: null,
        deductionChanges: [],
        removedMatches: matchDiff.removed,
        // Both sides, as above.
        snapshotHash: snapshotHash([snapshot.matches, storedMatches]),
      },
    },
  };
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
): Promise<Resolved | { reason: "input" | "provider" }> {
  if (!isKnownCompetition(choice)) return { reason: "input" };
  if (!Number.isInteger(seasonId)) return { reason: "input" };

  // `listSeasonsFor` refuses an unknown competition with `"input"`, which the
  // line above has already ruled out — so anything left is the provider failing
  // to say which seasons exist. Mapping the reason through a ternary here would
  // be a second copy of a check that has already run.
  const seasons = await listSeasonsFor(choice);
  if (!seasons.ok) return { reason: "provider" };

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
  let outcome: Awaited<ReturnType<typeof tasoDiff>>;
  try {
    outcome =
      snapshot.source === "taso"
        ? await tasoDiff(snapshot, seasonId, resolved)
        : await foreignDiff(snapshot, seasonId, resolved);
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
    if (resolved.reason === "provider") {
      await recordFailure(choice, seasonId, "provider", adminId);
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
    await writeSnapshot(snapshot, seasonId, removedIds);
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
  removedIds: number[]
): Promise<void> {
  await db.transaction(async (tx) => {
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
      return;
    }

    await synchronizeForeignMatches(snapshot.matches, tx);
    if (removedIds.length > 0) {
      await tx.delete(matches).where(inArray(matches.providerMatchId, removedIds));
    }
  });
}
