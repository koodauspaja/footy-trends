/**
 * The head-to-head page: every stored meeting between two teams, their record,
 * scorelines and goal averages, both teams' current form, and their next
 * meeting as the models predict it.
 *
 * decisions/042-head-to-head-view.md
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/047-rivalry-page.md
 * decisions/058-rivalry-prediction.md
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SIGNED_OUT_MESSAGE } from "@/components/analytics-section";
import { formatDecimal } from "@/components/charts/line-chart";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { FORM_ERROR_MESSAGE, TOO_FEW_MESSAGE } from "@/components/form-section";
import {
  type MatchListRow,
  MatchListTable,
  matchDateFormatter,
} from "@/components/match-list-table";
import { PredictionBody, predictsSides } from "@/components/match-prediction";
import { PageShell } from "@/components/page-shell";
import { RowLink } from "@/components/row-link";
import { ScoreGridTable, shadeLevel } from "@/components/score-grid-table";
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
  isCurrentRivalry,
  type ScoreAverage,
  type ScoreGrid,
  type Scoreline,
  scoreGrid,
  spansCalendarYears,
} from "@/lib/head-to-head";
import { baselineCompetition } from "@/lib/home-baseline";
import { formatKickoff, PLACEHOLDER_TEAM_ID, teamDisplayName } from "@/lib/match-detail";
import {
  type FootballDataMatchRow,
  getCompetitionAverages,
  getHeadToHeadHistory,
  getNextMeeting,
  getTeamForm,
  type HeadToHeadResult,
  type TasoMatchRow,
  type TeamForm,
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
import { comparedCompetitionName } from "@/lib/prediction-quality";
import { parseWholeNumber } from "@/lib/provider-ids";
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
/**
 * The group headings, shown only when the history is not the page's one group.
 *
 * decisions/047-rivalry-page.md
 * decisions/058-rivalry-prediction.md
 */
export const NEXT_GROUP_HEADING = "Seuraava kohtaaminen";
export const FORM_GROUP_HEADING = "Nykyinen vire";
export const HISTORY_GROUP_HEADING = "Keskinäinen historia";

/**
 * What a route file supplies to make this page its own.
 *
 * decisions/042-head-to-head-view.md
 */
export type HeadToHeadPageOptions = {
  params: Promise<{ a: string; b: string }>;
  /** Which table the ids resolve against, and under what predicate. */
  source: MatchSource;
  /** This route's own prefix, so a row links back to its match page. */
  basePath: string;
  /** Set on the national-team routes, which name their competitions through it. */
  nationalTeam?: NationalTeam;
};

/**
 * `24 ottelua, 1998–2025`, or a single year where that is the whole history.
 * The count is `matchCountLabel`'s, so one meeting reads `1 ottelu`.
 *
 * decisions/042-head-to-head-view.md
 */
export function playedLine(record: HeadToHeadRecord): string {
  const span = record.from === record.to ? `${record.from}` : `${record.from}–${record.to}`;
  return `${matchCountLabel(record.played)}, ${span}`;
}

/**
 * `HJK 11 – 6 tasan – 7 KuPS`, the first team's record read left to right.
 *
 * decisions/042-head-to-head-view.md
 */
export function recordLine(record: HeadToHeadRecord, first: string, second: string): string {
  return `${first} ${record.wins} – ${record.draws} ${DRAWS_LABEL} – ${record.losses} ${second}`;
}

/**
 * `Maalit 38 – 31`, the first team's first.
 *
 * decisions/042-head-to-head-view.md
 */
export function goalsLine(record: HeadToHeadRecord): string {
  return `${GOALS_LABEL} ${record.goalsFor} – ${record.goalsAgainst}`;
}

/**
 * `HJK kotona 8 – 3 – 1`, a win–draw–loss from that ground's home side.
 *
 * decisions/042-head-to-head-view.md
 */
export function homeLine(
  team: string,
  side: { wins: number; draws: number; losses: number }
): string {
  return `${team} ${HOME_SUFFIX} ${side.wins} – ${side.draws} – ${side.losses}`;
}

type View = {
  /** The id the URL names first, which the grid is read from. */
  firstId: number;
  /** The id the URL names second, whose form is the second block. */
  secondId: number;
  first: string;
  second: string;
  /** Never null: a view exists only when the pair has a meeting. */
  record: HeadToHeadRecord;
  rows: Array<Labelled<MatchListRow>>;
  /** The same meetings as `rows`, as the two analysis sections read them. */
  analysed: AnalysedMeeting[];
  windowSentence: string;
};

/**
 * The name each team goes by, read off the first meeting: the page is
 * addressed by two ids, so there is no match to take them from.
 *
 * decisions/042-head-to-head-view.md
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
  second: number,
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
      secondId: second,
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
    secondId: second,
    record,
    rows: labelled,
    analysed: labelled.map((row) => ({
      ...row,
      // The competition across seasons, so Liigacup's `LC2023` and `LC` are one row;
      // a category the registry does not claim is its own.
      competitionKey: competitionCodeForCategory(row.categoryId) ?? row.categoryId,
      season: { kind: "taso", competitionId: row.competitionCode, categoryId: row.categoryId },
    })),
    windowSentence,
  };
}

/**
 * A section's heading level: `h2` on its own, `h3` once groups wrap
 * the sections.
 *
 * decisions/047-rivalry-page.md
 */
type Level = 2 | 3;

function SectionHeading({
  level,
  id,
  children,
}: Readonly<{ level: Level; id: string; children: React.ReactNode }>) {
  return level === 2 ? (
    <h2 className="mb-2 font-semibold text-xl" id={id}>
      {children}
    </h2>
  ) : (
    <h3 className="mb-2 font-semibold text-lg" id={id}>
      {children}
    </h3>
  );
}

/**
 * `2–1`, the first team's goals first.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
function scorelineText(scoreline: Scoreline): string {
  return `${scoreline.first}–${scoreline.second}`;
}

/**
 * `0–0, 1–1 ja 2–1`: Finnish lists join their last item with `ja`. Only ever
 * given two or more.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
function listText(items: readonly string[]): string {
  return `${items.slice(0, -1).join(", ")} ja ${items.at(-1)}`;
}

/**
 * The sentence over the grid, or `null` when no scoreline occurred more than
 * once. Always `kertaa`; `kumpikin` for two scorelines and `kukin` for more.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export function mostCommonSentence(grid: ScoreGrid): string | null {
  const [only, ...rest] = grid.mostCommon;
  if (only === undefined) return null;
  const count = `${grid.mostCommonCount} kertaa`;
  if (rest.length === 0) return `Yleisin tulos ${scorelineText(only)}, ${count}.`;
  const each = rest.length === 1 ? "kumpikin" : "kukin";
  return `Yleisimmät tulokset ${listText(grid.mostCommon.map(scorelineText))}, ${each} ${count}.`;
}

/**
 * The `Tulokset` section: the grid, and its sentence where it has one.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
function ScoresSection({
  view,
  grid,
  level,
}: Readonly<{ view: View; grid: ScoreGrid; level: Level }>) {
  const sentence = mostCommonSentence(grid);
  return (
    <section aria-labelledby="h2h-scores" className="mb-8">
      <SectionHeading id="h2h-scores" level={level}>
        {SCORES_HEADING}
      </SectionHeading>
      {sentence === null ? null : <p className="mb-3">{sentence}</p>}
      <ScoreGridTable
        corner={`${view.first} ↓ / ${view.second} →`}
        rows={grid.rows.map((row) =>
          row.cells.map(({ count }) => ({
            level: shadeLevel(count, grid.largest),
            text: count === 0 ? "" : String(count),
          }))
        )}
      />
    </section>
  );
}

/**
 * `2,1 – 1,4`, home first, one decimal with a decimal comma.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
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

/**
 * What the averages section has to show: its rows, or that they could not be read.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
type Averages = { status: "ok"; rows: AveragesRow[] } | { status: "error" };

/**
 * The `Maalit kilpailuittain` section: one row per competition the pair met
 * in, against that competition's own average. A failed read keeps the heading.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
function AveragesSection({ averages, level }: Readonly<{ averages: Averages; level: Level }>) {
  return (
    <section aria-labelledby="h2h-averages" className="mb-8">
      <SectionHeading id="h2h-averages" level={level}>
        {AVERAGES_HEADING}
      </SectionHeading>
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
 * What `Seuraava kohtaaminen` shows: the meeting's line, the match and its
 * page, and `Ennuste`'s body for it.
 *
 * decisions/058-rivalry-prediction.md
 */
type NextGroup = { line: string; match: string; href: string; prediction: React.ReactNode };

/**
 * The pair's next meeting with its predictions, or `null`: none stored, one the
 * models do not predict, or a read that failed.
 *
 * decisions/058-rivalry-prediction.md
 * decisions/059-cup-predictions.md
 */
async function loadNext(
  view: View,
  { source, basePath }: HeadToHeadPageOptions,
  now: Date
): Promise<NextGroup | null> {
  const next = await getNextMeeting(source, view.firstId, view.secondId, now);
  if (next.status !== "ok" || next.match === null) return null;
  const competition = baselineCompetition(next.match);
  if (competition === null || !(await predictsSides(next.match, competition))) return null;

  const { match } = next.match;
  const home = teamDisplayName(match.homeTeamProviderId, match.homeTeamName);
  const away = teamDisplayName(match.awayTeamProviderId, match.awayTeamName);
  return {
    line: `${formatKickoff(match.kickoffAt)} · ${comparedCompetitionName(competition.kind, competition.code)}`,
    match: `${home} – ${away}`,
    href: `${basePath}/ottelu/${match.providerMatchId}`,
    prediction: await PredictionBody({ stored: next.match, competition }),
  };
}

/**
 * Both analysis sections' data, the form and the next meeting, or `null` for a
 * signed-out reader: the gate comes first. The TASO national-team routes have
 * the grid alone.
 *
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/047-rivalry-page.md
 * decisions/058-rivalry-prediction.md
 */
async function loadAnalysis(
  view: View,
  options: HeadToHeadPageOptions,
  today: Date
): Promise<{
  grid: ScoreGrid;
  averages: Averages | null;
  form: { first: TeamForm; second: TeamForm } | null;
  next: NextGroup | null;
} | null> {
  if (!(await canSeeAnalytics())) return null;
  const { source } = options;
  const isTasoNational = source.kind === "taso" && source.bucket === "national";
  const [averages, form, next] = await Promise.all([
    isTasoNational ? null : loadAverages(view),
    isTasoNational ? null : loadForm(view, source, today),
    isTasoNational ? null : loadNext(view, options, today),
  ]);
  return { grid: scoreGrid(view.analysed, view.firstId), averages, form, next };
}

/**
 * Both teams' current form, or `null` for a rivalry no longer played, with no
 * read made. The TASO national-team routes never reach this.
 *
 * decisions/047-rivalry-page.md
 */
async function loadForm(
  view: View,
  source: HeadToHeadPageOptions["source"],
  today: Date
): Promise<{ first: TeamForm; second: TeamForm } | null> {
  const latestMeeting = new Date(Math.max(...view.analysed.map((m) => m.kickoffAt.getTime())));
  if (!isCurrentRivalry(latestMeeting, today)) return null;

  const [first, second] = await Promise.all([
    getTeamForm(source, view.firstId),
    getTeamForm(source, view.secondId),
  ]);
  return { first, second };
}

function MatchupAnalysis({
  view,
  analysis,
  level,
}: Readonly<{ view: View; analysis: Awaited<ReturnType<typeof loadAnalysis>>; level: Level }>) {
  if (analysis === null) {
    return (
      <div className="mb-8">
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </div>
    );
  }
  return (
    <>
      <ScoresSection grid={analysis.grid} level={level} view={view} />
      {analysis.averages === null ? null : (
        <AveragesSection averages={analysis.averages} level={level} />
      )}
    </>
  );
}

/**
 * The `Yhteenveto` section: the record, the goals and each ground.
 *
 * decisions/042-head-to-head-view.md
 */
function Summary({ view, level }: Readonly<{ view: View; level: Level }>) {
  return (
    <section aria-labelledby="h2h-summary" className="mb-8">
      <SectionHeading id="h2h-summary" level={level}>
        {SUMMARY_HEADING}
      </SectionHeading>
      <p className="text-muted text-sm">{playedLine(view.record)}</p>
      <p className="mt-1 font-medium text-lg">{recordLine(view.record, view.first, view.second)}</p>
      <p className="mt-1">{goalsLine(view.record)}</p>
      <p className="mt-3 text-sm">{homeLine(view.first, view.record.firstAtHome)}</p>
      <p className="text-sm">{homeLine(view.second, view.record.secondAtHome)}</p>
    </section>
  );
}

/**
 * `2,2 pistettä ottelua kohden`: one decimal, a decimal comma.
 *
 * decisions/047-rivalry-page.md
 */
export function pointsLine(pointsPerMatch: number): string {
  return `${formatDecimal(pointsPerMatch)} pistettä ottelua kohden`;
}

/**
 * `Viimeisin ottelu 21.09.2026`, in the site's own date format.
 *
 * decisions/047-rivalry-page.md
 */
export function latestLine(latest: Date): string {
  return `Viimeisin ottelu ${matchDateFormatter.format(latest)}`;
}

/**
 * One team's block under `Nykyinen vire`: its last five results, oldest first,
 * each linking to its match; points per match; and when the newest was played.
 *
 * decisions/047-rivalry-page.md
 */
function FormBlock({
  id,
  name,
  form,
  basePath,
}: Readonly<{ id: string; name: string; form: TeamForm; basePath: string }>) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <h3 className="mb-2 font-semibold text-lg" id={id}>
        {name}
      </h3>
      {form.status === "error" ? <p>{FORM_ERROR_MESSAGE}</p> : null}
      {form.status === "too-few" ? <p>{TOO_FEW_MESSAGE}</p> : null}
      {form.status === "ok" ? (
        <>
          <p className="flex gap-2 font-medium">
            {form.entries.map((entry) => (
              <RowLink
                href={`${basePath}/ottelu/${entry.match.providerMatchId}`}
                key={entry.match.providerMatchId}
                title={entry.label}
              >
                {entry.result}
              </RowLink>
            ))}
          </p>
          <p className="mt-1">{pointsLine(form.pointsPerMatch)}</p>
          <p className="text-muted text-sm">{latestLine(form.latest)}</p>
        </>
      ) : null}
    </section>
  );
}

/**
 * A group heading over sections, as `Analyysit`'s groups are on the team page.
 *
 * decisions/047-rivalry-page.md
 */
function Group({
  id,
  heading,
  children,
}: Readonly<{ id: string; heading: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 className="mb-4 font-semibold text-2xl" id={id}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * Every stored meeting between two teams. Reached from a match page only, so a
 * page with no history is a hand-typed URL, and says so.
 *
 * decisions/042-head-to-head-view.md
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/047-rivalry-page.md
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
  const analysis = await loadAnalysis(view, options, new Date());
  // A group is headed only when the history is not the only one.
  const form = analysis?.form ?? null;
  const next = analysis?.next ?? null;
  const grouped = form !== null || next !== null;
  const level: Level = grouped ? 3 : 2;
  const history = (
    <>
      <Summary level={level} view={view} />
      <MatchupAnalysis analysis={analysis} level={level} view={view} />
      <section aria-labelledby="h2h-meetings">
        <SectionHeading id="h2h-meetings" level={level}>
          {MEETINGS_HEADING}
        </SectionHeading>
        <p className="mb-4 text-muted text-sm">{view.windowSentence}</p>
        <MatchListTable
          fourthColumn={{ header: COMPETITION_COLUMN, render: (match) => match.label }}
          matchHref={(match) => `${options.basePath}/ottelu/${match.providerMatchId}`}
          matches={view.rows}
          teamHref={null}
        />
      </section>
    </>
  );

  return (
    <PageShell heading={`${HEADING}: ${view.first} – ${view.second}`}>
      {grouped ? (
        <>
          {next === null ? null : (
            <Group heading={NEXT_GROUP_HEADING} id="h2h-next">
              <p className="text-muted text-sm">{next.line}</p>
              <p className="mt-1 mb-4 font-medium text-lg">
                <Link href={next.href}>{next.match}</Link>
              </p>
              {next.prediction}
            </Group>
          )}
          {form === null ? null : (
            <Group heading={FORM_GROUP_HEADING} id="h2h-form">
              <FormBlock
                basePath={options.basePath}
                form={form.first}
                id="h2h-form-first"
                name={view.first}
              />
              <FormBlock
                basePath={options.basePath}
                form={form.second}
                id="h2h-form-second"
                name={view.second}
              />
            </Group>
          )}
          <Group heading={HISTORY_GROUP_HEADING} id="h2h-history">
            {history}
          </Group>
        </>
      ) : (
        history
      )}
    </PageShell>
  );
}

/**
 * Resolves the two provider team ids. A non-numeric id, the placeholder team,
 * or a team against itself never reaches a query.
 *
 * decisions/042-head-to-head-view.md
 */
async function resolve(options: HeadToHeadPageOptions) {
  const { a, b } = await options.params;
  const first = parseWholeNumber(a);
  const second = parseWholeNumber(b);
  if (!isTeamId(first) || !isTeamId(second) || first === second) {
    return { status: "not_found" } as const;
  }

  const history = await getHeadToHeadHistory(options.source, first, second);
  if (history.status !== "ok") {
    return history.status === "error"
      ? ({ status: "error" } as const)
      : ({ status: "not_found" } as const);
  }

  const view = await buildView(history, first, second, options);
  return view === null ? ({ status: "not_found" } as const) : { status: "ok" as const, view };
}

function isTeamId(id: number | null): id is number {
  return id !== null && id !== PLACEHOLDER_TEAM_ID;
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
