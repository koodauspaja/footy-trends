import { and, desc, eq, inArray, notLike, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { type CompetitionRegion, competitionsInRegion } from "./competitions";
import {
  allDomesticCategoryIds,
  categoryIdsFor,
  competitionCodeForCategory,
} from "./domestic-competitions";
import { logger } from "./logger";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";
import { NATIONAL_TEAM_COMPETITION_PREFIX } from "./match-source";
import { isStoredInteger } from "./provider-ids";

/**
 * Which competition and season a team page shows when its URL does not say.
 *
 * A bare team URL already resolved before this existed — it meant "the region's
 * default competition, in its default season", which served 12 of 1,315 stored
 * Finnish team ids and 20 of 315 football-data ones. Everything else answered
 * "Joukkuetta ei löytynyt." on its own address. See
 * specs/020-context-free-team-page.md.
 */
export type TeamContext = { competitionCode: string; seasonId: number };

/**
 * What the URL already said, and therefore what the resolution must not
 * contradict. Both optional, which is the point: the rule fills in only what is
 * missing.
 */
export type TeamContextFilter = { competitionCode?: string; seasonId?: number };

export type TeamContextResult =
  | { status: "ok"; context: TeamContext }
  /** No stored match for this team under this route, filtered as asked. */
  | { status: "not_found" }
  | { status: "error" };

/**
 * The routes that have a team page. Not every `MatchSource` does: TASO's
 * national-team buckets carry Huuhkajat's and Helmarit's opponents, and neither
 * they nor Finland have a page to link to.
 */
export type TeamPageSource =
  | { kind: "football-data"; region: CompetitionRegion }
  | { kind: "taso"; bucket: "domestic" };

/** The team's newest stored match decides, so the ordering has to be total. */
const NEWEST_FIRST = [desc(matches.kickoffAt), desc(matches.providerMatchId)];
const TASO_NEWEST_FIRST = [desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId)];

async function resolveFootballData(
  region: CompetitionRegion,
  teamProviderId: number,
  filter: TeamContextFilter
): Promise<TeamContextResult> {
  const regionCodes = competitionsInRegion(region).map((competition) => competition.code);
  // A competition from another region is not a narrower question, it is a
  // different one — and answering it would render another region's team page.
  const codes =
    filter.competitionCode === undefined
      ? regionCodes
      : regionCodes.filter((code) => code === filter.competitionCode);
  if (codes.length === 0) return { status: "not_found" };

  const [row] = await db
    .select({ competitionCode: matches.competitionCode, seasonId: matches.seasonId })
    .from(matches)
    .where(
      and(
        or(
          eq(matches.homeTeamProviderId, teamProviderId),
          eq(matches.awayTeamProviderId, teamProviderId)
        ),
        inArray(matches.competitionCode, codes),
        filter.seasonId === undefined ? undefined : eq(matches.seasonId, filter.seasonId)
      )
    )
    .orderBy(...NEWEST_FIRST)
    .limit(1);

  return row === undefined ? { status: "not_found" } : { status: "ok", context: row };
}

async function resolveTaso(
  teamProviderId: number,
  filter: TeamContextFilter
): Promise<TeamContextResult> {
  // Only categories the picker claims: a row the site cannot show a page for
  // cannot answer "which page should this be".
  const categoryIds =
    filter.competitionCode === undefined
      ? allDomesticCategoryIds()
      : categoryIdsFor(filter.competitionCode);

  const [row] = await db
    .select({ categoryId: tasoMatches.categoryId, seasonId: tasoMatches.seasonId })
    .from(tasoMatches)
    .where(
      and(
        or(
          eq(tasoMatches.homeTeamProviderId, teamProviderId),
          eq(tasoMatches.awayTeamProviderId, teamProviderId)
        ),
        // The national-team buckets share this table and have no team pages.
        notLike(tasoMatches.competitionCode, `${NATIONAL_TEAM_COMPETITION_PREFIX}%`),
        inArray(tasoMatches.categoryId, categoryIds),
        filter.seasonId === undefined ? undefined : eq(tasoMatches.seasonId, filter.seasonId)
      )
    )
    .orderBy(...TASO_NEWEST_FIRST)
    .limit(1);

  if (row === undefined) return { status: "not_found" };
  const competitionCode = competitionCodeForCategory(row.categoryId);
  return competitionCode === null
    ? { status: "not_found" }
    : { status: "ok", context: { competitionCode, seasonId: row.seasonId } };
}

/**
 * Keyed on primitives rather than on the source and filter objects, which a
 * route rebuilds on every render — `cache()` compares arguments by identity, so
 * an object argument misses the cache every time. `generateMetadata` and the
 * page each ask for this once.
 */
const loadTeamContext = cache(async function loadTeamContext(
  kind: TeamPageSource["kind"],
  scope: string,
  teamProviderId: number,
  competitionCode: string,
  seasonId: number
): Promise<TeamContextResult> {
  // The sentinels are what let this be cached on primitives: "" is no
  // competition filter and 0 is no season filter, neither of which is a value
  // either field can legitimately take.
  const filter: TeamContextFilter = {
    ...(competitionCode === "" ? {} : { competitionCode }),
    ...(seasonId === 0 ? {} : { seasonId }),
  };

  try {
    return kind === "football-data"
      ? await resolveFootballData(scope as CompetitionRegion, teamProviderId, filter)
      : await resolveTaso(teamProviderId, filter);
  } catch (error) {
    logger.error(
      { err: error, kind, scope, teamProviderId },
      "Unable to resolve the team's own context"
    );
    return { status: "error" };
  }
});

/**
 * The competition and season a team page defaults to: those of the team's
 * newest stored match, narrowed by whatever the URL already said.
 *
 * The placeholder id short-circuits before any query. `0` is TASO's unresolved
 * bracket slot rather than a team — 22 stored rows carry it — and a page for it
 * could only ever be empty.
 */
export function getTeamContext(
  source: TeamPageSource,
  teamProviderId: number,
  filter: TeamContextFilter = {}
): Promise<TeamContextResult> {
  // The id alone, not `isPlaceholderTeam`: that also treats a blank *name* as a
  // placeholder, and there is no name here to judge. `isStoredInteger` refuses
  // what the column cannot hold, which would otherwise fail at bind time and
  // reach the reader as an error rather than a not-found.
  if (!isStoredInteger(teamProviderId) || teamProviderId === PLACEHOLDER_TEAM_ID) {
    return Promise.resolve({ status: "not_found" });
  }
  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadTeamContext(
    source.kind,
    scope,
    teamProviderId,
    filter.competitionCode ?? "",
    filter.seasonId ?? 0
  );
}
