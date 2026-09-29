import { ANALYTICS_HEADING, SIGNED_OUT_MESSAGE } from "@/components/analytics-section";
import { ChartPanel } from "@/components/charts/chart-panel";
import { formatDecimal, LineChart, percentText } from "@/components/charts/line-chart";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import {
  type GoalsPerGamePoint,
  type GoalsPerGameSeries,
  hasGoalsPerGame,
} from "@/lib/goals-per-game";
import { getGoalsPerGame, getOutcomeShares } from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";
import {
  type OutcomeRow,
  type OutcomeShares,
  roundedAdvantage,
  type SeasonRange,
} from "@/lib/outcome-shares";
import { formatSeasonLabel } from "@/lib/seasons";

/** The strings agreed in specs/048, each where the spec places it. */
export const SEASON_BY_SEASON_HEADING = "Kausi kaudelta";
export const GOALS_PER_GAME_HEADING = "Maaleja ottelua kohden";
export const TOO_FEW_SEASONS_MESSAGE =
  "Maaleja ottelua kohden kausittain näytetään, kun kilpailusta on tallennettu vähintään kaksi kautta.";
export const GOALS_PER_GAME_ERROR_MESSAGE =
  "Maalikeskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.";
export const STORED_SEASONS_NOTE = "Perustuu tallennettuihin kausiin.";
export const IN_PROGRESS_NOTE = "(kesken)";
export const SIDE_BY_SIDE_HEADING = "Kilpailut rinnakkain";
export const HOME_ADVANTAGE_HEADING = "Kotietu ja tasapelit";
export const HOME_ADVANTAGE_ERROR_MESSAGE = "Kotietua ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_OWN_MATCHES_MESSAGE = "Kilpailusta ei ole tallennettuja otteluita näiltä kausilta.";
export const ROUNDING_NOTE =
  "Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista.";

const SECTION_ID = "competition-analytics";
const GROUP_ID = "competition-analytics-by-season";
const PANEL_ID = "goals-per-game";
const SIDE_BY_SIDE_ID = "competition-analytics-side-by-side";
const HOME_ADVANTAGE_ID = "home-advantage";

/** How the page names a season: `2024` or `2024/25`, as its own selector does. */
type SeasonLabel = (seasonId: number) => string;

/** A season left out by the five-match minimum, named under the chart (S14). */
export function leftOutSentence(label: string): string {
  return `Kausi ${label} näytetään, kun siitä on pelattu vähintään viisi ottelua.`;
}

/** One row of the text alternative (specs/048, UX). */
export function seasonSentence(point: GoalsPerGamePoint, label: string): string {
  const season = point.inProgress ? `${label} ${IN_PROGRESS_NOTE}` : label;
  return `Kausi ${season}: ${formatDecimal(point.perGame)} maalia ottelua kohden, ${point.matches} ottelua.`;
}

/** `Kotietu` as printed: signed, with a real minus (specs/049, S5). */
export function advantageText(advantage: number): string {
  const points = roundedAdvantage(advantage);
  if (points > 0) return `+${points}`;
  return points < 0 ? `\u2212${-points}` : "0";
}

function rangeText(range: SeasonRange, spansCalendarYears: boolean): string {
  const first = formatSeasonLabel(range.first, spansCalendarYears);
  const last = formatSeasonLabel(range.last, spansCalendarYears);
  return first === last ? first : `${first}–${last}`;
}

/**
 * The seasons the table covers, of both kinds, from the data rather than
 * literals (S18) — or nothing when it has no row at all.
 */
export function windowSentence(
  calendarYears: SeasonRange | null,
  spanningYears: SeasonRange | null
): string | null {
  const ranges = [
    calendarYears && rangeText(calendarYears, false),
    spanningYears && rangeText(spanningYears, true),
  ].filter((range) => range !== null);
  return ranges.length === 0 ? null : `Kaudet ${ranges.join(" ja ")}, kaikki tallennetut ottelut.`;
}

const OUTCOME_COLUMNS: ReadonlyArray<DataTableColumn<OutcomeRow>> = [
  {
    key: "competition",
    header: "Kilpailu",
    width: "flex",
    render: (row) => row.name,
    rowHeader: true,
  },
  { key: "matches", header: "Ottelut", width: 80, align: "right", render: (row) => row.matches },
  {
    key: "home",
    header: "Kotivoitot",
    width: 104,
    align: "right",
    render: (row) => percentText(row.homeShare),
  },
  {
    key: "draws",
    header: "Tasapelit",
    width: 96,
    align: "right",
    render: (row) => percentText(row.drawShare),
  },
  {
    key: "away",
    header: "Vierasvoitot",
    width: 112,
    align: "right",
    render: (row) => percentText(row.awayShare),
  },
  {
    key: "advantage",
    header: "Kotietu",
    width: 88,
    align: "right",
    render: (row) => advantageText(row.advantage),
  },
];

/**
 * The competition standings page's `Analyysit` (specs/048): `Kausi kaudelta`,
 * holding goals per game, then `Kilpailut rinnakkain`, holding home advantage
 * and draws (specs/049, S12). #342 joins them.
 *
 * **Its sign-in rules are the ones the team page's `Analyysit` follows**
 * (specs/048, S4): no section at all on a competition S5 does not name; the
 * gate is asked before anything is read, so a signed-out page carries no
 * value; one prompt, not one per panel.
 *
 * Awaited by the pages rather than rendered, as `AnalyticsSection` is: an
 * async component nested in JSX is not something every renderer can draw.
 */
export async function CompetitionAnalyticsSection({
  kind,
  competitionCode,
  selectedSeasonId,
  activeSeasonId,
  seasonLabel,
}: Readonly<{
  kind: MatchSource["kind"];
  competitionCode: string;
  selectedSeasonId: number;
  activeSeasonId: number;
  seasonLabel: SeasonLabel;
}>) {
  if (!hasGoalsPerGame(kind, competitionCode)) return null;

  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const [series, shares] = await Promise.all([
    getGoalsPerGame(kind, competitionCode, activeSeasonId),
    getOutcomeShares(),
  ]);
  return (
    <Section>
      <Group heading={SEASON_BY_SEASON_HEADING} id={GROUP_ID}>
        <ChartPanel heading={GOALS_PER_GAME_HEADING} headingId={PANEL_ID}>
          <GoalsPerGameBody
            selectedSeasonId={selectedSeasonId}
            series={series}
            seasonLabel={seasonLabel}
          />
        </ChartPanel>
      </Group>
      <Group heading={SIDE_BY_SIDE_HEADING} id={SIDE_BY_SIDE_ID}>
        <ChartPanel heading={HOME_ADVANTAGE_HEADING} headingId={HOME_ADVANTAGE_ID}>
          <HomeAdvantageBody competitionCode={competitionCode} kind={kind} shares={shares} />
        </ChartPanel>
      </Group>
    </Section>
  );
}

function Group({
  heading,
  id,
  children,
}: Readonly<{ heading: string; id: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={id} className="mt-4">
      <h3 className="font-medium text-muted text-sm uppercase tracking-wide" id={id}>
        {heading}
      </h3>
      {children}
    </section>
  );
}

/**
 * The table of every compared competition, this one's row marked (S4). Without
 * a row of its own it still compares the others, and says why this one is
 * absent (S16).
 */
function HomeAdvantageBody({
  shares,
  kind,
  competitionCode,
}: Readonly<{ shares: OutcomeShares; kind: MatchSource["kind"]; competitionCode: string }>) {
  if (shares.status === "error") return <p>{HOME_ADVANTAGE_ERROR_MESSAGE}</p>;

  const isOwn = (row: OutcomeRow) => row.kind === kind && row.code === competitionCode;
  const seasons = windowSentence(shares.calendarYears, shares.spanningYears);
  return (
    <div>
      {shares.rows.some(isOwn) ? null : <p className="mb-2">{NO_OWN_MATCHES_MESSAGE}</p>}
      <DataTable
        columns={OUTCOME_COLUMNS}
        isCurrentRow={isOwn}
        rowKey={(row) => `${row.kind}:${row.code}`}
        rows={shares.rows}
      />
      {seasons === null ? null : <p className="mt-2 text-muted text-sm">{seasons}</p>}
      <p className="mt-2 text-muted text-sm">{ROUNDING_NOTE}</p>
    </div>
  );
}

function Section({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <section aria-labelledby={SECTION_ID} className="mt-10">
      <h2 className="mb-2 font-semibold text-xl" id={SECTION_ID}>
        {ANALYTICS_HEADING}
      </h2>
      {children}
    </section>
  );
}

function GoalsPerGameBody({
  series,
  selectedSeasonId,
  seasonLabel,
}: Readonly<{ series: GoalsPerGameSeries; selectedSeasonId: number; seasonLabel: SeasonLabel }>) {
  if (series.status === "error") return <p>{GOALS_PER_GAME_ERROR_MESSAGE}</p>;
  if (series.status === "too-few") return <p>{TOO_FEW_SEASONS_MESSAGE}</p>;

  const textId = `${PANEL_ID}-text`;
  // An `ok` series has at least two points (S10), so both ends exist.
  const seasons = series.points.map((point) => point.seasonId);
  const first = Math.min(...seasons);
  const last = Math.max(...seasons);
  const inProgress = new Set(
    series.points.filter((point) => point.inProgress).map((point) => point.seasonId)
  );

  return (
    <div>
      <LineChart
        describedBy={textId}
        formatXTick={seasonLabel}
        formatYTick={(tick) => formatDecimal(tick)}
        labelledBy={PANEL_ID}
        series={[
          {
            name: "goals-per-game",
            points: series.points.map((point) => ({
              x: point.seasonId,
              y: point.perGame,
              marked: point.seasonId === selectedSeasonId,
            })),
          },
        ]}
        thinXTicksOnPhone
        title={GOALS_PER_GAME_HEADING}
        xDomain={[first, last]}
        xLabel="Kausi"
        xTickNote={(tick) => (inProgress.has(tick) ? IN_PROGRESS_NOTE : undefined)}
        xTicks={seasons}
        yDomain={series.yDomain}
        yLabel="Maaleja / ottelu"
        yTicks={series.yTicks}
      />
      <ol className="sr-only" id={textId}>
        {series.points.map((point) => (
          <li key={point.seasonId}>{seasonSentence(point, seasonLabel(point.seasonId))}</li>
        ))}
      </ol>
      {series.leftOut.map((seasonId) => (
        <p className="mt-2 text-sm" key={seasonId}>
          {leftOutSentence(seasonLabel(seasonId))}
        </p>
      ))}
      <p className="mt-2 text-muted text-sm">{STORED_SEASONS_NOTE}</p>
    </div>
  );
}
