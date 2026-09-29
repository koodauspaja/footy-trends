import { ANALYTICS_HEADING, SIGNED_OUT_MESSAGE } from "@/components/analytics-section";
import { ChartPanel } from "@/components/charts/chart-panel";
import { formatDecimal, LineChart } from "@/components/charts/line-chart";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import {
  type GoalsPerGamePoint,
  type GoalsPerGameSeries,
  hasGoalsPerGame,
} from "@/lib/goals-per-game";
import { getGoalsPerGame } from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";

/** The strings agreed in specs/048, each where the spec places it. */
export const SEASON_BY_SEASON_HEADING = "Kausi kaudelta";
export const GOALS_PER_GAME_HEADING = "Maaleja ottelua kohden";
export const TOO_FEW_SEASONS_MESSAGE =
  "Maaleja ottelua kohden kausittain näytetään, kun kilpailusta on tallennettu vähintään kaksi kautta.";
export const GOALS_PER_GAME_ERROR_MESSAGE =
  "Maalikeskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.";
export const STORED_SEASONS_NOTE = "Perustuu tallennettuihin kausiin.";
export const IN_PROGRESS_NOTE = "(kesken)";

const SECTION_ID = "competition-analytics";
const GROUP_ID = "competition-analytics-by-season";
const PANEL_ID = "goals-per-game";

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

/**
 * The competition standings page's `Analyysit` (specs/048): its first group,
 * `Kausi kaudelta`, holding goals per game. #339, #340 and #342 join it.
 *
 * **The rules are the team page's** (S4): no section at all on a competition
 * S5 does not name; the gate is asked before anything is read, so a signed-out
 * page carries no value; one prompt, not one per panel.
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

  const series = await getGoalsPerGame(kind, competitionCode, activeSeasonId);
  return (
    <Section>
      <section aria-labelledby={GROUP_ID} className="mt-4">
        <h3 className="font-medium text-muted text-sm uppercase tracking-wide" id={GROUP_ID}>
          {SEASON_BY_SEASON_HEADING}
        </h3>
        <ChartPanel heading={GOALS_PER_GAME_HEADING} headingId={PANEL_ID}>
          <GoalsPerGameBody
            selectedSeasonId={selectedSeasonId}
            series={series}
            seasonLabel={seasonLabel}
          />
        </ChartPanel>
      </section>
    </Section>
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
