import type { Metadata } from "next";
import { SIGNED_OUT_MESSAGE } from "@/components/analytics-section";
import { formatDecimal } from "@/components/charts/line-chart";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { toFinnishTasoTeamNames, toFinnishTeamNames } from "@/lib/country-names";
import { competitionCodeForCategory } from "@/lib/domestic-competitions";
import {
  type AnalysedMeeting,
  type CompetitionGroup,
  competitionGroups,
  type HeadToHeadRecord,
  headToHeadRecord,
  headToHeadWindow,
  headToHeadWindowSentence,
  SCORE_GRID_CAP,
  type ScoreAverage,
  type ScoreGrid,
  type Scoreline,
  scoreGrid,
} from "@/lib/head-to-head";
import { PLACEHOLDER_TEAM_ID, teamDisplayName } from "@/lib/match-detail";
import {
  type FootballDataMatchRow,
  getCompetitionAverages,
  getHeadToHeadHistory,
  type HeadToHeadResult,
  type TasoMatchRow,
} from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";
import {
  COMPETITION_COLUMN,
  categoryNameLoader,
  type Labelled,
  labelFootballDataRows,
  labelTasoRows,
} from "@/lib/meeting-labels";
import { matchCountLabel, type NationalTeam } from "@/lib/national-team";
import { isStoredInteger } from "@/lib/provider-ids";
import { toFinishedMatches } from "@/lib/standings";

const HEADING = "Kohtaamiset";
const SUMMARY_HEADING = "Yhteenveto";
const MEETINGS_HEADING = "Kohtaamiset";
const NOT_FOUND_MESSAGE = "Kohtaamisia ei löytynyt.";
const ERROR_MESSAGE = "Kohtaamisten lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const DRAWS_LABEL = "tasan";
const GOALS_LABEL = "Maalit";
const HOME_SUFFIX = "kotona";
const SCORES_HEADING = "Tulokset";
const AVERAGES_HEADING = "Maalit kilpailuittain";
const AVERAGES_NOTE =
  "Kotijoukkueen maalit ensin. Kilpailun keskiarvo lasketaan niiden kausien otteluista, joina joukkueet kohtasivat siinä.";
export const AVERAGES_ERROR_MESSAGE = "Keskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.";

/** What a route file supplies to make this page its own. */
export type HeadToHeadPageOptions = {
  params: Promise<{ a: string; b: string }>;
  /** Which table the ids resolve against, and under what predicate. See specs/019. */
  source: MatchSource;
  /** This route's own prefix, so a row links back to its match page. */
  basePath: string;
  /** Set on the national-team routes, which name their competitions through it. */
  nationalTeam?: NationalTeam;
};

/**
 * `24 ottelua, 1998–2025`, or a single year where that is the whole history.
 *
 * `matchCountLabel` rather than a literal `ottelua`: Finnish counts one thing
 * differently, and a pair that has met once would otherwise read `1 ottelua`.
 */
export function playedLine(record: HeadToHeadRecord): string {
  const span = record.from === record.to ? `${record.from}` : `${record.from}–${record.to}`;
  return `${matchCountLabel(record.played)}, ${span}`;
}

/** `HJK 11 – 6 tasan – 7 KuPS`, the first team's record read left to right. */
export function recordLine(record: HeadToHeadRecord, first: string, second: string): string {
  return `${first} ${record.wins} – ${record.draws} ${DRAWS_LABEL} – ${record.losses} ${second}`;
}

/** `Maalit 38 – 31`, the first team's first. */
export function goalsLine(record: HeadToHeadRecord): string {
  return `${GOALS_LABEL} ${record.goalsFor} – ${record.goalsAgainst}`;
}

/** `HJK kotona 8 – 3 – 1`, a win–draw–loss from that ground's home side. */
export function homeLine(
  team: string,
  side: { wins: number; draws: number; losses: number }
): string {
  return `${team} ${HOME_SUFFIX} ${side.wins} – ${side.draws} – ${side.losses}`;
}

type View = {
  /** The id the URL names first, which the grid is read from (specs/044, S5). */
  firstId: number;
  first: string;
  second: string;
  /**
   * Never null. A view exists only when the pair has a meeting, and a meeting
   * is what `headToHeadRecord` needs — so the summary cannot be handed a record
   * of nothing, and does not guard against one.
   */
  record: HeadToHeadRecord;
  rows: Array<Labelled<MatchListRow>>;
  /** The same meetings as `rows`, as the two analysis sections read them (specs/044). */
  analysed: AnalysedMeeting[];
  windowSentence: string;
};

/**
 * Whether this region's seasons cross a calendar year, for the window sentence.
 *
 * **Decided from the region, not asked of the provider.** specs/042 promises
 * this page makes no provider request, and the first version called
 * `getSeasonContext` — which hangs a test runner with no API key and, worse,
 * made the promise false. The flag only shapes a label (`2023/24` against
 * `2026`), and that distinction is exactly region-shaped: the foreign
 * competitions are leagues played across a winter, the national-team ones are
 * tournaments played inside one summer. TASO ignores the flag entirely —
 * `headToHeadWindow` answers with a year or a bare season there.
 */
function spansCalendarYears(source: MatchSource): boolean {
  return source.kind === "football-data" && source.region === "foreign";
}

/**
 * The name each team goes by, read off the meetings themselves.
 *
 * There is no match to take them from — the page is addressed by two ids — so
 * the first meeting names both, and whichever side an id was on in it decides
 * which name belongs to which id.
 */
function namesFrom(
  rows: ReadonlyArray<{
    homeTeamProviderId: number;
    homeTeamName: string;
    awayTeamProviderId: number;
    awayTeamName: string;
  }>,
  first: number
): { first: string; second: string } | null {
  const [meeting] = rows;
  if (meeting === undefined) return null;

  const firstIsHome = meeting.homeTeamProviderId === first;
  return {
    first: teamDisplayName(first, firstIsHome ? meeting.homeTeamName : meeting.awayTeamName),
    second: teamDisplayName(
      firstIsHome ? meeting.awayTeamProviderId : meeting.homeTeamProviderId,
      firstIsHome ? meeting.awayTeamName : meeting.homeTeamName
    ),
  };
}

async function buildView(
  history: Extract<HeadToHeadResult, { status: "ok" }>,
  first: number,
  options: HeadToHeadPageOptions
): Promise<View | null> {
  const windowSentence = headToHeadWindowSentence(
    headToHeadWindow(options.source, spansCalendarYears(options.source))
  );

  if (options.source.kind === "football-data") {
    const rows = history.matches as FootballDataMatchRow[];
    const localised = options.source.region === "national-teams" ? toFinnishTeamNames(rows) : rows;
    const names = namesFrom(localised, first);
    // `toFinishedMatches` narrows the two goal columns, which the query has
    // already filtered on — the record cannot be asked about a match with no
    // score, and this is where the type learns it.
    const record = headToHeadRecord(toFinishedMatches(localised), first);
    if (names === null || record === null) return null;

    const labelled = toFinishedMatches(labelFootballDataRows(localised));
    return {
      ...names,
      firstId: first,
      record,
      rows: labelled,
      analysed: labelled.map((row) => ({
        ...row,
        competitionKey: row.competitionCode,
        season: {
          kind: "football-data",
          competitionCode: row.competitionCode,
          seasonId: row.seasonId,
        },
      })),
      windowSentence,
    };
  }

  const rows = history.matches as TasoMatchRow[];
  const national = options.nationalTeam;
  const localised = national === undefined ? rows : toFinnishTasoTeamNames(rows);
  const names = namesFrom(localised, first);
  const record = headToHeadRecord(toFinishedMatches(localised), first);
  if (names === null || record === null) return null;

  const labelled = toFinishedMatches(
    await labelTasoRows(national, localised, categoryNameLoader())
  );
  return {
    ...names,
    firstId: first,
    record,
    rows: labelled,
    analysed: labelled.map((row) => ({
      ...row,
      // The competition across seasons, so Liigacup's `LC2023` and `LC` are
      // one row (specs/043); a category the registry does not claim is its own.
      competitionKey: competitionCodeForCategory(row.categoryId) ?? row.categoryId,
      season: { kind: "taso", competitionId: row.competitionCode, categoryId: row.categoryId },
    })),
    windowSentence,
  };
}

/** `2–1`, the first team's goals first (specs/044, S5). */
function scorelineText(scoreline: Scoreline): string {
  return `${scoreline.first}–${scoreline.second}`;
}

/** `0–0, 1–1 ja 2–1`: Finnish lists join their last item with `ja`. Only ever given two or more. */
function listText(items: readonly string[]): string {
  return `${items.slice(0, -1).join(", ")} ja ${items.at(-1)}`;
}

/**
 * The sentence over the grid, or `null` when there is nothing to say: with
 * every scoreline occurring once there is no most common one (specs/044, S8).
 *
 * Always `kertaa`, never `kerran` — a count of one is exactly that case.
 * `kumpikin` for two scorelines and `kukin` for more, as Finnish counts them.
 */
export function mostCommonSentence(grid: ScoreGrid): string | null {
  const [only, ...rest] = grid.mostCommon;
  if (only === undefined) return null;
  const count = `${grid.mostCommonCount} kertaa`;
  if (rest.length === 0) return `Yleisin tulos ${scorelineText(only)}, ${count}.`;
  const each = rest.length === 1 ? "kumpikin" : "kukin";
  return `Yleisimmät tulokset ${listText(grid.mostCommon.map(scorelineText))}, ${each} ${count}.`;
}

/** An axis label: the number of goals, or `5+` for the capped last row and column. */
export function goalsLabel(goals: number): string {
  return goals === SCORE_GRID_CAP ? `${SCORE_GRID_CAP}+` : String(goals);
}

/** How many shading steps a filled cell can take, light to dark. */
const SHADE_STEPS = [18, 38, 62, 85] as const;

/**
 * How dark a cell is: 0 for an empty one, else 1–4 by its share of the fullest
 * cell — one hue, light to dark, mixed from the theme's own foreground and
 * background so it is right in dark mode too. The count is printed in every
 * filled cell, so the shading is never the only way to read it.
 */
export function shadeLevel(count: number, largest: number): number {
  if (count === 0) return 0;
  return Math.ceil((count / largest) * SHADE_STEPS.length);
}

function ScoreCell({ count, largest }: Readonly<{ count: number; largest: number }>) {
  const level = shadeLevel(count, largest);
  const mix = SHADE_STEPS[level - 1];
  return (
    <td
      className={`h-9 w-10 border border-border-subtle text-center ${level >= 3 ? "text-background" : ""}`}
      data-level={level}
      style={
        mix === undefined
          ? undefined
          : {
              backgroundColor: `color-mix(in oklab, var(--color-foreground) ${mix}%, var(--color-background))`,
            }
      }
    >
      {count === 0 ? "" : count}
    </td>
  );
}

/** The `Tulokset` section (specs/044, #337): the grid, and its sentence where it has one. */
function ScoresSection({ view, grid }: Readonly<{ view: View; grid: ScoreGrid }>) {
  const sentence = mostCommonSentence(grid);
  return (
    <section aria-labelledby="h2h-scores" className="mb-8">
      <h2 className="mb-2 font-semibold text-xl" id="h2h-scores">
        {SCORES_HEADING}
      </h2>
      {sentence === null ? null : <p className="mb-3">{sentence}</p>}
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th className="p-2 text-left font-normal text-muted text-xs" scope="col">
                {`${view.first} ↓ / ${view.second} →`}
              </th>
              {grid.rows.map((row) => (
                <th className="w-10 p-2 text-center font-medium" key={row.first} scope="col">
                  {goalsLabel(row.first)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.first}>
                <th className="p-2 text-right font-medium" scope="row">
                  {goalsLabel(row.first)}
                </th>
                {row.cells.map((cell) => (
                  <ScoreCell count={cell.count} key={cell.second} largest={grid.largest} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** `2,1 – 1,4`, home first, one decimal with a decimal comma (specs/044). */
export function averageText(average: ScoreAverage): string {
  return `${formatDecimal(average.home)} – ${formatDecimal(average.away)}`;
}

type AveragesRow = CompetitionGroup & { competition: ScoreAverage };

const AVERAGES_COLUMNS: ReadonlyArray<DataTableColumn<AveragesRow>> = [
  {
    key: "competition",
    header: "Kilpailu",
    width: "flex",
    render: (row) => row.label,
    rowHeader: true,
  },
  { key: "played", header: "Ottelut", width: 72, align: "right", render: (row) => row.played },
  {
    key: "meetings",
    header: "Kohtaamisissa",
    width: 128,
    align: "right",
    render: (row) => averageText(row.average),
  },
  {
    key: "competitionAverage",
    header: "Kilpailussa",
    width: 112,
    align: "right",
    render: (row) => averageText(row.competition),
  },
];

/** What the averages section has to show: its rows, or that they could not be read (S10). */
type Averages = { status: "ok"; rows: AveragesRow[] } | { status: "error" };

/**
 * The `Maalit kilpailuittain` section (specs/044, #338): one row per
 * competition the pair met in, against that competition's own average in the
 * seasons they met in it (S3, S4, S7). A failed read keeps the heading and says
 * so (S10), so it never looks like there was nothing to compare.
 */
function AveragesSection({ averages }: Readonly<{ averages: Averages }>) {
  return (
    <section aria-labelledby="h2h-averages" className="mb-8">
      <h2 className="mb-2 font-semibold text-xl" id="h2h-averages">
        {AVERAGES_HEADING}
      </h2>
      {averages.status === "error" ? (
        <p>{AVERAGES_ERROR_MESSAGE}</p>
      ) : (
        <>
          <DataTable columns={AVERAGES_COLUMNS} rowKey={(row) => row.key} rows={averages.rows} />
          <p className="mt-2 text-muted text-sm">{AVERAGES_NOTE}</p>
        </>
      )}
    </section>
  );
}

async function loadAverages(view: View): Promise<Averages> {
  return getCompetitionAverages(competitionGroups(view.analysed));
}

/**
 * Both analysis sections' data, or `null` for a signed-out reader (specs/044,
 * S6).
 *
 * **The gate comes first**, as it does for `Analyysit`: a signed-out request
 * computes neither section, so its page carries no count or average from them.
 * The TASO national-team routes have no averages (S9) — a category there holds
 * only Finland's group of a competition, so its "average" would not be the
 * competition's.
 *
 * Loaded here and rendered by plain components, as `AnalyticsSection` is
 * awaited rather than nested: an async component inside JSX is not something
 * every renderer can draw.
 */
async function loadAnalysis(
  view: View,
  source: HeadToHeadPageOptions["source"]
): Promise<{ grid: ScoreGrid; averages: Averages | null } | null> {
  if (!(await canSeeAnalytics())) return null;
  const withAverages = !(source.kind === "taso" && source.bucket === "national");
  return {
    grid: scoreGrid(view.analysed, view.firstId),
    averages: withAverages ? await loadAverages(view) : null,
  };
}

function MatchupAnalysis({
  view,
  analysis,
}: Readonly<{ view: View; analysis: Awaited<ReturnType<typeof loadAnalysis>> }>) {
  if (analysis === null) {
    return (
      <div className="mb-8">
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </div>
    );
  }
  return (
    <>
      <ScoresSection grid={analysis.grid} view={view} />
      {analysis.averages === null ? null : <AveragesSection averages={analysis.averages} />}
    </>
  );
}

/** The `Yhteenveto` section: the record, the goals and each ground (specs/042, S9). */
function Summary({ view }: Readonly<{ view: View }>) {
  return (
    <section aria-labelledby="h2h-summary" className="mb-8">
      <h2 className="mb-2 font-semibold text-xl" id="h2h-summary">
        {SUMMARY_HEADING}
      </h2>
      <p className="text-muted text-sm">{playedLine(view.record)}</p>
      <p className="mt-1 font-medium text-lg">{recordLine(view.record, view.first, view.second)}</p>
      <p className="mt-1">{goalsLine(view.record)}</p>
      <p className="mt-3 text-sm">{homeLine(view.first, view.record.firstAtHome)}</p>
      <p className="text-sm">{homeLine(view.second, view.record.secondAtHome)}</p>
    </section>
  );
}

/**
 * Every stored meeting between two teams (specs/042).
 *
 * Reached from a match page and nowhere else (S1), so the pair always has a
 * history: a page with none is a hand-typed URL, and says so rather than
 * rendering an empty summary.
 */
export async function HeadToHeadPage(options: Readonly<HeadToHeadPageOptions>) {
  const resolved = await resolve(options);

  if (resolved.status === "error") {
    return (
      <PageShell heading={HEADING}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }
  if (resolved.status !== "ok") {
    return (
      <PageShell heading={HEADING}>
        <p>{NOT_FOUND_MESSAGE}</p>
      </PageShell>
    );
  }

  const { view } = resolved;
  const analysis = await loadAnalysis(view, options.source);
  return (
    <PageShell heading={`${HEADING}: ${view.first} – ${view.second}`}>
      <Summary view={view} />
      <MatchupAnalysis analysis={analysis} view={view} />
      <section aria-labelledby="h2h-meetings">
        <h2 className="mb-2 font-semibold text-xl" id="h2h-meetings">
          {MEETINGS_HEADING}
        </h2>
        <p className="mb-4 text-muted text-sm">{view.windowSentence}</p>
        <MatchListTable
          fourthColumn={{ header: COMPETITION_COLUMN, render: (match) => match.label }}
          matchHref={(match) => `${options.basePath}/ottelu/${match.providerMatchId}`}
          matches={view.rows}
          teamHref={null}
        />
      </section>
    </PageShell>
  );
}

/**
 * The ids are the *provider's* team ids, as every team link on the site uses.
 * A non-numeric id, the placeholder team, or a team against itself never
 * reaches a query.
 */
async function resolve(options: HeadToHeadPageOptions) {
  const { a, b } = await options.params;
  const first = Number(a);
  const second = Number(b);
  if (!isTeamId(first) || !isTeamId(second) || first === second) {
    return { status: "not_found" } as const;
  }

  const history = await getHeadToHeadHistory(options.source, first, second);
  if (history.status !== "ok") {
    return history.status === "error"
      ? ({ status: "error" } as const)
      : ({ status: "not_found" } as const);
  }

  const view = await buildView(history, first, options);
  return view === null ? ({ status: "not_found" } as const) : { status: "ok" as const, view };
}

function isTeamId(id: number): boolean {
  return isStoredInteger(id) && id !== PLACEHOLDER_TEAM_ID;
}

export async function headToHeadMetadata(
  options: Readonly<HeadToHeadPageOptions>
): Promise<Metadata> {
  const resolved = await resolve(options);
  return {
    title:
      resolved.status === "ok"
        ? `${HEADING}: ${resolved.view.first} – ${resolved.view.second}`
        : HEADING,
  };
}
