import {
  getTeamContext,
  type TeamContext,
  type TeamContextFilter,
  type TeamPageSource,
} from "./team-context";

/**
 * What a team page shows before it has looked at a single match: the competition
 * and season its URL did not name, or the fact that this team has no page at
 * all. See specs/020-context-free-team-page.md.
 */
export type TeamPageDefaults =
  /** The team has no stored match under this route. Not "no matches this season". */
  { status: "not_found" } | { status: "error" } | { status: "ok"; defaults: TeamContext };

const POSITIVE_INTEGER = /^\d+$/;

/**
 * A `kausi` value that could be a season, before anything knows which seasons
 * are selectable.
 *
 * Selectable seasons depend on the competition, and on a bare URL the
 * competition is what we are still resolving — so the filter uses the value's
 * shape and the page's existing validation still decides whether it earns a
 * notice.
 */
export function seasonCandidate(rawValue: string | string[] | undefined): number | undefined {
  if (typeof rawValue !== "string" || !POSITIVE_INTEGER.test(rawValue)) return undefined;
  const seasonId = Number(rawValue);
  // Digits alone are not enough: three hundred of them parse to `Infinity`,
  // which is not a season and which Postgres rejects outright when it reaches
  // an integer comparison. An unusable value is no filter at all, and the
  // page's own validation still gives it the Finnish notice.
  return Number.isSafeInteger(seasonId) ? seasonId : undefined;
}

/**
 * The team's own context, narrowed by whatever the URL already said.
 *
 * Two questions, in this order, because they have different answers:
 *
 * 1. **Does this team exist here at all?** Asked without any filter. A `no`
 *    means the page has nothing to offer — not a season selector, and not a
 *    standings link for a competition the team has never played in.
 * 2. **What should the URL's gaps be filled with?** Asked with the filter.
 *
 * A season filter that matches nothing is dropped rather than obeyed. A season
 * the team never played says nothing about which *competition* the reader
 * wanted, and falling back to the region's default competition — which is what
 * happened before this existed — is the answer that serves 12 of 1,315 Finnish
 * teams. The season itself is still honoured downstream, so an unplayed season
 * still ends at `Joukkuetta ei löytynyt.`, under the team's own competition.
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
