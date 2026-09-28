import { and, desc, eq, inArray, isNotNull, like, lt, ne, notLike, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { type CompetitionRegion, competitionsInRegion } from "./competitions";
import { HEAD_TO_HEAD_LIMIT } from "./head-to-head";
import { logger } from "./logger";
import { hasPlaceholderTeam } from "./match-detail";
import { type MatchSource, NATIONAL_TEAM_COMPETITION_PREFIX } from "./match-source";
import { isStoredInteger } from "./provider-ids";

export type FootballDataMatchRow = typeof matches.$inferSelect;
export type TasoMatchRow = typeof tasoMatches.$inferSelect;

/**
 * A stored match, tagged with the table it came from.
 *
 * The two rows are not interchangeable — one carries a score breakdown and a
 * stage, the other a series name and TASO's own verdict on who went through —
 * so the page branches on `source` rather than flattening them into a shape
 * that would have to lie about one of them.
 */
export type StoredMatch =
  | { source: "football-data"; match: FootballDataMatchRow }
  | { source: "taso"; match: TasoMatchRow };

/**
 * Why the head-to-head block is empty, when it is.
 *
 * `unavailable` is not an error: it is a match with a placeholder team, where
 * there is no identity to look up. Telling the reader that is honest;
 * showing an empty list would claim these teams have never met.
 */
export type HeadToHeadResult =
  | { status: "ok"; matches: FootballDataMatchRow[] }
  | { status: "ok"; matches: TasoMatchRow[] }
  | { status: "unavailable" }
  | { status: "error" };

export type MatchPageData =
  | { status: "not_found" }
  | { status: "error" }
  | { status: "ok"; match: StoredMatch; headToHead: HeadToHeadResult };

/** The `competition_id` predicate that splits TASO's shared table by bucket. */
function tasoBucketPredicate(bucket: "domestic" | "national") {
  const pattern = `${NATIONAL_TEAM_COMPETITION_PREFIX}%`;
  return bucket === "national"
    ? like(tasoMatches.competitionCode, pattern)
    : notLike(tasoMatches.competitionCode, pattern);
}

/** Whether a football-data row belongs to the region whose route asked for it. */
function isInRegion(row: FootballDataMatchRow, region: CompetitionRegion): boolean {
  return competitionsInRegion(region).some(
    (competition) => competition.code === row.competitionCode
  );
}

/** Whether a TASO row belongs to the bucket whose route asked for it. */
function isInBucket(row: TasoMatchRow, bucket: "domestic" | "national"): boolean {
  const isNational = row.competitionCode.startsWith(NATIONAL_TEAM_COMPETITION_PREFIX);
  return bucket === "national" ? isNational : !isNational;
}

/**
 * The five most recent meetings between the same two teams, newest first.
 *
 * Every clause is a decision, and they are set out in specs/019-match-page.md:
 * both orientations, strictly earlier than this match, played matches only, and
 * scoped to the same source so a Kotimaa page cannot surface a Huuhkajat row
 * out of the table they share. The ordering is total — two meetings can share a
 * kickoff instant, and a page that reordered between renders would be a bug
 * nobody could reproduce.
 *
 * A leg of a two-legged tie is a match here, with its own row and its own
 * score. Ties belong to the bracket; this is a list of matches.
 */
/**
 * The five most recent meetings between the same two teams, newest first.
 *
 * Two functions rather than one taking both providers: a single one had to
 * re-check that the row and the route agreed about the source, which the caller
 * already knows by construction — and that check was an unreachable branch
 * pretending to be error handling. Each is called from the branch that already
 * proved its own types.
 *
 * Every clause is a decision, set out in specs/019-match-page.md: both
 * orientations, strictly earlier than this match, played matches only, and
 * scoped to the same source so a Kotimaa page cannot surface a Huuhkajat row
 * out of the table they share. The ordering is total — two meetings can share a
 * kickoff instant, and a page that reordered between renders would be a bug
 * nobody could reproduce.
 *
 * A leg of a two-legged tie is a match here, with its own row and its own
 * score. Ties belong to the bracket; this is a list of matches.
 */
async function footballDataHeadToHead(
  region: CompetitionRegion,
  match: FootballDataMatchRow
): Promise<HeadToHeadResult> {
  if (hasPlaceholderTeam(match)) return { status: "unavailable" };
  const home = match.homeTeamProviderId;
  const away = match.awayTeamProviderId;
  const codes = competitionsInRegion(region).map((competition) => competition.code);

  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        or(
          and(eq(matches.homeTeamProviderId, home), eq(matches.awayTeamProviderId, away)),
          and(eq(matches.homeTeamProviderId, away), eq(matches.awayTeamProviderId, home))
        ),
        ne(matches.providerMatchId, match.providerMatchId),
        lt(matches.kickoffAt, match.kickoffAt),
        eq(matches.status, FINISHED_STATUS),
        isNotNull(matches.homeGoals),
        isNotNull(matches.awayGoals),
        inArray(matches.competitionCode, codes)
      )
    )
    .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId))
    .limit(HEAD_TO_HEAD_LIMIT);
  return { status: "ok", matches: rows };
}

async function tasoHeadToHead(
  bucket: "domestic" | "national",
  match: TasoMatchRow
): Promise<HeadToHeadResult> {
  if (hasPlaceholderTeam(match)) return { status: "unavailable" };
  const home = match.homeTeamProviderId;
  const away = match.awayTeamProviderId;

  const rows = await db
    .select()
    .from(tasoMatches)
    .where(
      and(
        or(
          and(eq(tasoMatches.homeTeamProviderId, home), eq(tasoMatches.awayTeamProviderId, away)),
          and(eq(tasoMatches.homeTeamProviderId, away), eq(tasoMatches.awayTeamProviderId, home))
        ),
        ne(tasoMatches.providerMatchId, match.providerMatchId),
        lt(tasoMatches.kickoffAt, match.kickoffAt),
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals),
        tasoBucketPredicate(bucket)
      )
    )
    .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId))
    .limit(HEAD_TO_HEAD_LIMIT);
  return { status: "ok", matches: rows };
}

/**
 * Every stored meeting between two teams, newest first — the whole history
 * behind specs/042, rather than the five a match page shows.
 *
 * Three things differ from the block on the match page, and each is a decision
 * rather than an omission:
 *
 * - **no anchor** (S4). The match page takes only meetings before its own
 *   kickoff, because it is context for that fixture; a history of the pair is
 *   not about one fixture, so a meeting played since belongs in it;
 * - **no limit** (S5). `HEAD_TO_HEAD_LIMIT` is a choice about the match page;
 * - **no exclusion** of the match linked from, which is one of the meetings.
 *
 * What is *not* different is the competition scope (S2) or which matches count
 * (S3): every competition in the region, finished, both scores stored. A
 * fixture still to come is returned by neither read, so nothing on that page
 * can describe a match that has not been played.
 */
export const getHeadToHeadHistory = cache(
  async (source: MatchSource, first: number, second: number): Promise<HeadToHeadResult> => {
    // A team has no history against itself, and asking would return every
    // meeting it ever hosted against itself: none, but by accident.
    if (first === second) return { status: "unavailable" };

    try {
      return source.kind === "taso"
        ? await tasoHistory(source.bucket, first, second)
        : await footballDataHistory(source.region, first, second);
    } catch (error) {
      logger.error({ err: error, first, second }, "Unable to read the head-to-head history");
      return { status: "error" };
    }
  }
);

/**
 * How many stored meetings the pair has — the number the match page's link
 * carries (specs/042, S10).
 *
 * Counted from the same read the full page performs, so the two cannot
 * disagree: `(24)` on the link is 24 rows on the page. A separate `count()`
 * would be cheaper and would be a second query able to answer differently.
 */
export async function countHeadToHeadHistory(
  source: MatchSource,
  first: number,
  second: number
): Promise<number | null> {
  const history = await getHeadToHeadHistory(source, first, second);
  return history.status === "ok" ? history.matches.length : null;
}

async function footballDataHistory(
  region: CompetitionRegion,
  first: number,
  second: number
): Promise<HeadToHeadResult> {
  const codes = competitionsInRegion(region).map((competition) => competition.code);

  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        or(
          and(eq(matches.homeTeamProviderId, first), eq(matches.awayTeamProviderId, second)),
          and(eq(matches.homeTeamProviderId, second), eq(matches.awayTeamProviderId, first))
        ),
        eq(matches.status, FINISHED_STATUS),
        isNotNull(matches.homeGoals),
        isNotNull(matches.awayGoals),
        inArray(matches.competitionCode, codes)
      )
    )
    .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId));
  return { status: "ok", matches: rows };
}

async function tasoHistory(
  bucket: "domestic" | "national",
  first: number,
  second: number
): Promise<HeadToHeadResult> {
  const rows = await db
    .select()
    .from(tasoMatches)
    .where(
      and(
        or(
          and(
            eq(tasoMatches.homeTeamProviderId, first),
            eq(tasoMatches.awayTeamProviderId, second)
          ),
          and(eq(tasoMatches.homeTeamProviderId, second), eq(tasoMatches.awayTeamProviderId, first))
        ),
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals),
        tasoBucketPredicate(bucket)
      )
    )
    .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId));
  return { status: "ok", matches: rows };
}

const FINISHED_STATUS = "FINISHED";

/**
 * One match and its previous meetings, or why neither is there.
 *
 * Cached per request because Next.js calls `generateMetadata` and the page
 * separately, and both need the same two rows — the same reason
 * `getTeamMatches` is cached. Keyed on primitives rather than on the source
 * object, which a route rebuilds on every render and which would therefore
 * miss the cache every time.
 *
 * A head-to-head failure never reaches the match: the reader came for the
 * match, and the secondary block failing is not a reason to blank it.
 */
const loadMatchPageData = cache(async function loadMatchPageData(
  kind: MatchSource["kind"],
  scope: string,
  providerMatchId: number
): Promise<MatchPageData> {
  const source = (
    kind === "football-data"
      ? { kind, region: scope as CompetitionRegion }
      : { kind, bucket: scope as "domestic" | "national" }
  ) as MatchSource;

  let stored: StoredMatch;
  // Bound inside the branch that knows both the row's type and the route's, so
  // the two can never disagree.
  let headToHead: () => Promise<HeadToHeadResult>;
  try {
    if (source.kind === "football-data") {
      const [row] = await db
        .select()
        .from(matches)
        .where(eq(matches.providerMatchId, providerMatchId))
        .limit(1);
      if (row === undefined || !isInRegion(row, source.region)) return { status: "not_found" };
      stored = { source: "football-data", match: row };
      headToHead = () => footballDataHeadToHead(source.region, row);
    } else {
      const [row] = await db
        .select()
        .from(tasoMatches)
        .where(eq(tasoMatches.providerMatchId, providerMatchId))
        .limit(1);
      if (row === undefined || !isInBucket(row, source.bucket)) return { status: "not_found" };
      stored = { source: "taso", match: row };
      headToHead = () => tasoHeadToHead(source.bucket, row);
    }
  } catch (error) {
    logger.error({ err: error, kind, scope, providerMatchId }, "Unable to load the match");
    return { status: "error" };
  }

  try {
    return { status: "ok", match: stored, headToHead: await headToHead() };
  } catch (error) {
    logger.error({ err: error, kind, scope, providerMatchId }, "Unable to load the head-to-head");
    return { status: "ok", match: stored, headToHead: { status: "error" } };
  }
});

export function getMatchPageData(
  source: MatchSource,
  providerMatchId: number
): Promise<MatchPageData> {
  // An id the column cannot hold is a match that cannot exist. Left to the
  // database it fails at bind time instead, and the reader is told the site
  // broke. See specs/020-context-free-team-page.md.
  if (!isStoredInteger(providerMatchId)) return Promise.resolve({ status: "not_found" });

  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadMatchPageData(source.kind, scope, providerMatchId);
}
