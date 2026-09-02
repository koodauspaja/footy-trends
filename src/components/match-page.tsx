import type { Metadata } from "next";
import Link from "next/link";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { getCompetitionName } from "@/lib/competitions";
import { toFinnishTasoTeamNames, toFinnishTeamNames } from "@/lib/country-names";
import {
  competitionCodeForCategory,
  getDomesticCompetitionName,
  isDomesticCup,
} from "@/lib/domestic-competitions";
import { getSeasonContext } from "@/lib/football-data";
import { headToHeadWindow, headToHeadWindowSentence } from "@/lib/head-to-head";
import { logger } from "@/lib/logger";
import {
  declaredWinnerSide,
  formatKickoff,
  formatScore,
  isPlaceholderTeam,
  matchContextLines,
  teamDisplayName,
} from "@/lib/match-detail";
import {
  type FootballDataMatchRow,
  getMatchPageData,
  type HeadToHeadResult,
  type StoredMatch,
  type TasoMatchRow,
} from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";
import {
  competitionLabel,
  MENS_TEAM,
  NATIONAL_TEAM_ACTIVE_YEAR,
  type NationalTeam,
  WOMENS_TEAM,
} from "@/lib/national-team";
import { isStoredInteger } from "@/lib/provider-ids";
import { formatSeasonLabel } from "@/lib/seasons";
import { getSeasonCategoryNameMap } from "@/lib/taso-standings-service";

const MATCH_HEADING = "Ottelu";
const NOT_FOUND_MESSAGE = "Ottelua ei löytynyt.";
const ERROR_MESSAGE = "Ottelun lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const HEAD_TO_HEAD_HEADING = "Aiemmat kohtaamiset";
const COMPETITION_COLUMN = "Kilpailu";
const HEAD_TO_HEAD_EMPTY = "Aiempia kohtaamisia ei löytynyt.";
const HEAD_TO_HEAD_ERROR = "Aiempien kohtaamisten lataaminen epäonnistui.";
const HEAD_TO_HEAD_UNAVAILABLE =
  "Aiempia kohtaamisia ei voida näyttää, koska toista joukkuetta ei tunnisteta.";

/** What a route file supplies to make this page its own. */
export type MatchPageOptions = {
  params: Promise<{ id: string }>;
  /** Which table the id resolves against, and under what predicate. See specs/019. */
  source: MatchSource;
  /** This route's own prefix, so a head-to-head row links back into it. */
  basePath: string;
  /**
   * Where a team name links, or `null` where no team page exists.
   *
   * Null on the two national-team routes: neither Finland nor its opponents have
   * a page under `/maajoukkueet`, and #71 asks for a link to a team's *existing*
   * page. #246 is what would change that.
   */
  teamBasePath: string | null;
  /** Set on the two TASO national-team routes, which name their competition through it. */
  nationalTeam?: NationalTeam;
};

/** Everything the markup needs, with every provider difference already resolved. */
type MatchView = {
  homeName: string;
  awayName: string;
  homeHref: string | null;
  awayHref: string | null;
  kickoff: string;
  contextLines: string[];
  score: string;
  winnerSide: "home" | "away" | null;
  windowSentence: string;
  /** Always `Kilpailu`: a competition name where one resolves, TASO's series name otherwise. */
  headToHeadHeader: string;
  /** Each row carries its own fourth-column label — a competition, or a series. */
  headToHeadRows: Array<MatchListRow & { label: string }>;
  title: string;
};

/**
 * Whether this competition's seasons cross a calendar year, for the season label.
 *
 * `null` when the provider cannot be reached: the match is the page, and the
 * season then shows as its bare start year rather than taking the whole page
 * down for a missing slash.
 */
async function resolveSpansCalendarYears(competitionCode: string): Promise<boolean | null> {
  try {
    return (await getSeasonContext(competitionCode)).spansCalendarYears;
  } catch (error) {
    logger.error({ err: error, competitionCode }, "Unable to resolve the season label");
    return null;
  }
}

/**
 * TASO's category names for one provider bucket, or `null` if it cannot be
 * asked.
 *
 * The two season arguments decide the cache TTL, and only that: a bucket at or
 * above the active year is treated as still changing and cached for fifteen
 * minutes, an older one as settled and cached for a year. So the bucket's own
 * season goes first and `NATIONAL_TEAM_ACTIVE_YEAR` second — passing the active
 * year twice makes every bucket look current, which is the fifteen-minute
 * re-fetch this is meant to avoid.
 */
async function loadCategoryNames(
  competitionCode: string,
  seasonId: number
): Promise<Record<string, string> | null> {
  try {
    return await getSeasonCategoryNameMap(competitionCode, seasonId, NATIONAL_TEAM_ACTIVE_YEAR);
  } catch (error) {
    logger.error({ err: error, competitionId: competitionCode }, "Unable to read TASO categories");
    return null;
  }
}

/**
 * A category name as a competition label, with the team suffix stripped.
 *
 * The route names a team, but a hand-typed id can point at the other one's
 * category — and stripping the wrong suffix would leave "… Huuhkajat" on the
 * Helmarit page. The suffix the name actually carries wins.
 */
function labelFromCategoryName(team: NationalTeam, categoryName: string): string {
  const owner = [MENS_TEAM, WOMENS_TEAM].find((candidate) =>
    categoryName.endsWith(candidate.categorySuffix)
  );
  return competitionLabel(owner ?? team, categoryName);
}

/**
 * A per-render memo over `loadCategoryNames`, keyed by bucket.
 *
 * `getCached` does not deduplicate in-flight misses, so on a cold cache every
 * caller sees the miss and fetches the same map. One page asks about the match
 * it is displaying and about up to five previous meetings, which at 1.28
 * buckets per list are usually the same one or two.
 */
type CategoryNames = (
  competitionCode: string,
  seasonId: number
) => Promise<Record<string, string> | null>;

function categoryNameLoader(): CategoryNames {
  const byBucket = new Map<string, Promise<Record<string, string> | null>>();
  // Keyed by bucket alone: a bucket has one season, so the season only ever
  // repeats what the key already says.
  return (competitionCode, seasonId) => {
    const pending = byBucket.get(competitionCode);
    if (pending !== undefined) return pending;
    const started = loadCategoryNames(competitionCode, seasonId);
    byBucket.set(competitionCode, started);
    return started;
  };
}

/**
 * The competition a single national-team match belonged to, normalised: TASO's
 * category name with the team suffix stripped, so `UEFA Nations League
 * Huuhkajat` reads as `UEFA Nations League`. `null` when the bucket's category
 * map has no entry for the row, or could not be read at all.
 */
async function resolveNationalCompetitionName(
  team: NationalTeam,
  match: TasoMatchRow,
  names: CategoryNames
): Promise<string | null> {
  const categoryName = (await names(match.competitionCode, match.seasonId))?.[match.categoryId];
  return categoryName === undefined ? null : labelFromCategoryName(team, categoryName);
}

/**
 * Builds a team link for a match, or always `null` where this route has no team
 * pages to link to (`/maajoukkueet/huuhkajat`, `/maajoukkueet/helmarit`) or the
 * row belongs to a competition our registry does not claim.
 */
function teamHrefBuilder(
  basePath: string | null,
  competitionCode: string | null,
  seasonId: number
): (teamProviderId: number) => string | null {
  if (basePath === null || competitionCode === null) return () => null;
  return (teamProviderId) =>
    `${basePath}/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;
}

/**
 * A team's href, unless the team is a placeholder.
 *
 * Id `0` is TASO's unresolved bracket slot, not a team: it renders as
 * `Tuntematon joukkue`, and `/kotimaa/joukkue/0` is a page that cannot exist.
 * Applied to both providers rather than only to TASO — `matches` has no
 * placeholder rows today, and one rule is cheaper than remembering that.
 */
function linkableTeamHref(
  teamProviderId: number,
  teamName: string,
  build: (teamProviderId: number) => string | null
): string | null {
  return isPlaceholderTeam(teamProviderId, teamName) ? null : build(teamProviderId);
}

function headToHeadRowsOf(result: HeadToHeadResult): Array<FootballDataMatchRow | TasoMatchRow> {
  return result.status === "ok" ? result.matches : [];
}

/** The football-data half of the view: `/ulkomaat` and `/maajoukkueet`'s WC and EC. */
async function footballDataView(
  match: FootballDataMatchRow,
  headToHead: HeadToHeadResult,
  options: MatchPageOptions
): Promise<MatchView> {
  const spans = await resolveSpansCalendarYears(match.competitionCode);
  const competitionName = getCompetitionName(match.competitionCode);
  const seasonLabel =
    spans === null ? String(match.seasonId) : formatSeasonLabel(match.seasonId, spans);

  const localise =
    options.source.kind === "football-data" && options.source.region === "national-teams";
  const [localised = match] = localise ? toFinnishTeamNames([match]) : [match];
  const rows = headToHeadRowsOf(headToHead) as FootballDataMatchRow[];
  const localisedRows = localise ? toFinnishTeamNames(rows) : rows;

  const teamHref = teamHrefBuilder(options.teamBasePath, match.competitionCode, match.seasonId);

  return {
    homeName: teamDisplayName(localised.homeTeamProviderId, localised.homeTeamName),
    awayName: teamDisplayName(localised.awayTeamProviderId, localised.awayTeamName),
    homeHref: linkableTeamHref(match.homeTeamProviderId, localised.homeTeamName, teamHref),
    awayHref: linkableTeamHref(match.awayTeamProviderId, localised.awayTeamName, teamHref),
    kickoff: formatKickoff(match.kickoffAt),
    contextLines: matchContextLines({
      source: "football-data",
      competitionLabel: `${competitionName} ${seasonLabel}`,
      matchday: match.matchday,
      stage: match.stage,
      groupName: match.groupName,
    }),
    score: formatScore(match),
    winnerSide: null,
    // `spans ?? false` deliberately: when the provider cannot be reached the
    // season above shows as a bare year, and the sentence must not describe the
    // same season as `2026/27` two lines below it.
    windowSentence: headToHeadWindowSentence(headToHeadWindow(options.source, spans ?? false)),
    headToHeadHeader: COMPETITION_COLUMN,
    headToHeadRows: localisedRows.map((row) => ({
      ...row,
      label: getCompetitionName(row.competitionCode),
    })),
    title: `${localised.homeTeamName} – ${localised.awayTeamName}, ${competitionName} ${seasonLabel}`,
  };
}

/**
 * What to call the competition a TASO row belonged to.
 *
 * Two different questions behind one line: a domestic row's category maps to a
 * competition in our own registry, while a national-team row's name lives only
 * in TASO's category map. `null` from either — an unclaimed junior category, or
 * a map that could not be read — costs one line, not the page.
 */
function tasoCompetitionName(
  team: NationalTeam | undefined,
  domesticCode: string | null,
  match: TasoMatchRow,
  names: CategoryNames
): Promise<string | null> | string | null {
  if (team !== undefined) return resolveNationalCompetitionName(team, match, names);
  return domesticCode === null ? null : getDomesticCompetitionName(domesticCode);
}

/**
 * The previous meetings, each labelled with the competition it was played in.
 *
 * The head-to-head deliberately spans competitions, so this column is the only
 * signal for which one a meeting belonged to — and TASO's `group_name` names a
 * stage instead: `5. Kierros` leaves a cup tie looking like a league round, and
 * on the national-team side it can be `2024`, `Slovakia` or `Heinäkuu`. See
 * #251.
 *
 * Two different lookups behind one column, as elsewhere on this page: a
 * domestic row's category maps to a competition in our own registry, while a
 * national-team row's name lives only in TASO's category map — cached, and
 * already read for the displayed match. A national-team list touches 1.28 of
 * those maps on average and three at most, measured across all 104 stored pairs
 * on 2026-09-02.
 *
 * The group name stays as the fallback for a row nothing can name: a category
 * the picker does not claim, or a map that could not be read.
 */
async function labelTasoHeadToHead(
  team: NationalTeam | undefined,
  rows: TasoMatchRow[],
  names: CategoryNames
): Promise<Array<TasoMatchRow & { label: string }>> {
  if (team === undefined) {
    return rows.map((row) => {
      const code = competitionCodeForCategory(row.categoryId);
      return { ...row, label: code === null ? row.groupName : getDomesticCompetitionName(code) };
    });
  }

  return Promise.all(
    rows.map(async (row) => {
      const categoryName = (await names(row.competitionCode, row.seasonId))?.[row.categoryId];
      return {
        ...row,
        label:
          categoryName === undefined ? row.groupName : labelFromCategoryName(team, categoryName),
      };
    })
  );
}

/** The TASO half: `/kotimaa`, and the two national-team routes. */
async function tasoView(
  match: TasoMatchRow,
  headToHead: HeadToHeadResult,
  options: MatchPageOptions
): Promise<MatchView> {
  const national = options.nationalTeam;
  const rows = headToHeadRowsOf(headToHead) as TasoMatchRow[];
  const [localised = match] = national === undefined ? [match] : toFinnishTasoTeamNames([match]);
  const localisedRows = national === undefined ? rows : toFinnishTasoTeamNames(rows);

  const domesticCode = competitionCodeForCategory(match.categoryId);
  // One memo for the whole view: the displayed match and its previous meetings
  // usually sit in the same bucket, and asking twice would fetch it twice.
  const categoryNames = categoryNameLoader();
  const competitionName = await tasoCompetitionName(national, domesticCode, match, categoryNames);
  const labelledRows = await labelTasoHeadToHead(national, localisedRows, categoryNames);
  const season = national === undefined ? match.seasonId : match.kickoffAt.getUTCFullYear();

  const teamHref = teamHrefBuilder(options.teamBasePath, domesticCode, match.seasonId);

  return {
    homeName: teamDisplayName(localised.homeTeamProviderId, localised.homeTeamName),
    awayName: teamDisplayName(localised.awayTeamProviderId, localised.awayTeamName),
    homeHref: linkableTeamHref(match.homeTeamProviderId, localised.homeTeamName, teamHref),
    awayHref: linkableTeamHref(match.awayTeamProviderId, localised.awayTeamName, teamHref),
    kickoff: formatKickoff(match.kickoffAt),
    contextLines: matchContextLines({
      source: "taso",
      competitionLabel: competitionName === null ? null : `${competitionName} ${season}`,
      matchday: match.matchday,
      seriesName: match.groupName,
      // A national-team round is a real round; a Finnish cup round is the
      // series name itself. See `roundLine`.
      isCup: national === undefined && domesticCode !== null && isDomesticCup(domesticCode),
    }),
    score: formatScore(match),
    winnerSide: declaredWinnerSide(match, match.winner),
    windowSentence: headToHeadWindowSentence(headToHeadWindow(options.source, false)),
    headToHeadHeader: COMPETITION_COLUMN,
    headToHeadRows: labelledRows,
    title: `${localised.homeTeamName} – ${localised.awayTeamName}${
      competitionName === null ? "" : `, ${competitionName} ${season}`
    }`,
  };
}

function buildView(
  stored: StoredMatch,
  headToHead: HeadToHeadResult,
  options: MatchPageOptions
): Promise<MatchView> {
  return stored.source === "football-data"
    ? footballDataView(stored.match, headToHead, options)
    : tasoView(stored.match, headToHead, options);
}

/**
 * The id is the *provider's* match id, as every team link on the site uses the
 * provider's team id — the value that survives a re-sync. A non-numeric id
 * never reaches a query.
 */
async function resolve(options: MatchPageOptions) {
  const { id } = await options.params;
  const providerMatchId = Number(id);
  if (!isStoredInteger(providerMatchId)) return { status: "not_found" } as const;

  const data = await getMatchPageData(options.source, providerMatchId);
  if (data.status !== "ok") return data;
  return {
    status: "ok" as const,
    data,
    view: await buildView(data.match, data.headToHead, options),
  };
}

export async function matchMetadata(options: MatchPageOptions): Promise<Metadata> {
  const resolved = await resolve(options);
  return { title: resolved.status === "ok" ? resolved.view.title : NOT_FOUND_MESSAGE };
}

function TeamName({
  name,
  href,
  isWinner,
}: Readonly<{ name: string; href: string | null; isWinner: boolean }>) {
  const className = isWinner ? "font-semibold" : undefined;
  if (href === null) return <span className={className}>{name}</span>;
  return (
    <Link className={`hover:underline ${className ?? ""}`.trim()} href={href}>
      {name}
    </Link>
  );
}

function HeadToHead({ view, basePath }: Readonly<{ view: MatchView; basePath: string }>) {
  return (
    <section>
      <h2 className="mb-2 font-semibold text-xl">{HEAD_TO_HEAD_HEADING}</h2>
      <p className="mb-4 text-sm text-zinc-600">{view.windowSentence}</p>
      {view.headToHeadRows.length === 0 ? (
        <p>{HEAD_TO_HEAD_EMPTY}</p>
      ) : (
        <MatchListTable
          matches={view.headToHeadRows}
          teamHref={null}
          matchHref={(match) => `${basePath}/ottelu/${match.providerMatchId}`}
          fourthColumn={{ header: view.headToHeadHeader, render: (match) => match.label }}
        />
      )}
    </section>
  );
}

/**
 * One match, in whichever region it was reached from.
 *
 * Five routes share this body — see specs/019-match-page.md for why
 * `/maajoukkueet` needs two of them. A not-found renders inside the normal page
 * shell rather than as a 404, which is what the team pages already do.
 */
export async function MatchPage(options: Readonly<MatchPageOptions>) {
  const resolved = await resolve(options);

  // A page with no match has nothing to name in its heading, and repeating the
  // message there would state it twice. The team pages head their own
  // not-found with the competition; this is the equivalent.
  if (resolved.status !== "ok") {
    return (
      <PageShell heading={MATCH_HEADING}>
        <p>{resolved.status === "not_found" ? NOT_FOUND_MESSAGE : ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  const { view, data } = resolved;

  return (
    <PageShell heading={`${view.homeName} – ${view.awayName}`}>
      {/* A scoreboard rather than a repeat of the heading: the names sit either
          side of the score, and carry the links a heading string cannot. */}
      <p className="mb-3 text-2xl">
        <TeamName href={view.homeHref} isWinner={view.winnerSide === "home"} name={view.homeName} />
        <span className="mx-3 font-semibold">{view.score}</span>
        <TeamName href={view.awayHref} isWinner={view.winnerSide === "away"} name={view.awayName} />
      </p>
      <p className="mb-1 text-sm text-zinc-600">{view.kickoff}</p>
      {view.contextLines.map((line) => (
        <p className="text-sm text-zinc-600" key={line}>
          {line}
        </p>
      ))}
      <div className="mt-10">
        {data.headToHead.status === "error" && <p>{HEAD_TO_HEAD_ERROR}</p>}
        {data.headToHead.status === "unavailable" && <p>{HEAD_TO_HEAD_UNAVAILABLE}</p>}
        {data.headToHead.status === "ok" && <HeadToHead basePath={options.basePath} view={view} />}
      </div>
    </PageShell>
  );
}
