import { parseWholeNumber } from "./provider-ids";
import {
  getTeamContext,
  type TeamContext,
  type TeamContextFilter,
  type TeamPageSource,
} from "./team-context";

/**
 * What a team page shows before it has looked at a single match: the
 * competition and season its URL did not name, or the fact that this team has
 * no page at all.
 *
 * decisions/020-context-free-team-page.md
 */
export type TeamPageDefaults =
  /** The team has no stored match under this route. Not "no matches this season". */
  { status: "not_found" } | { status: "error" } | { status: "ok"; defaults: TeamContext };

/**
 * A `kausi` value that could be a season, judged by its shape, before anything
 * knows which seasons are selectable.
 *
 * decisions/020-context-free-team-page.md
 */
export function seasonCandidate(rawValue: string | string[] | undefined): number | undefined {
  // `parseWholeNumber` refuses a value past the column as well as one that is
  // not digits, so neither reaches a query. An unusable value is no filter at
  // all, and the page's own validation still gives it its notice.
  return parseWholeNumber(rawValue) ?? undefined;
}

/**
 * The team's own context, narrowed by whatever the URL already said. First
 * whether the team exists here at all, asked without a filter; then what fills
 * the URL's gaps. A season filter that matches nothing is dropped.
 *
 * decisions/020-context-free-team-page.md
 */
export async function resolveTeamDefaults(
  source: TeamPageSource,
  teamProviderId: number,
  filter: TeamContextFilter
): Promise<TeamPageDefaults> {
  const anyMatch = await getTeamContext(source, teamProviderId);
  if (anyMatch.status !== "ok") return anyMatch;

  const narrowed = await getTeamContext(source, teamProviderId, filter);
  if (narrowed.status === "ok") return { status: "ok", defaults: narrowed.context };
  // A database that could not answer is not a team that did not play: falling
  // back here would render some other competition as though it were the answer.
  if (narrowed.status === "error") return narrowed;

  if (filter.seasonId === undefined) {
    // Only a competition filter, and the team never played it. The page renders
    // that competition and says so; the season comes from its own default.
    return { status: "ok", defaults: anyMatch.context };
  }

  const withoutSeason = await getTeamContext(
    source,
    teamProviderId,
    filter.competitionCode === undefined ? {} : { competitionCode: filter.competitionCode }
  );
  if (withoutSeason.status === "error") return withoutSeason;
  return {
    status: "ok",
    defaults: withoutSeason.status === "ok" ? withoutSeason.context : anyMatch.context,
  };
}
