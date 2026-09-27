import { Fragment } from "react";
import { cleanSheetsPanel } from "@/components/clean-sheets-section";
import { comebacksPanel } from "@/components/comebacks-section";
import { formPanel } from "@/components/form-section";
import { rollingGoalsPanel, totalGoalsPanel } from "@/components/goals-section";
import { homeAwayPanel } from "@/components/home-away-section";
import { positionPanel } from "@/components/league-position-section";
import { seasonComparisonPanel } from "@/components/season-comparison-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { streakRecordsPanel } from "@/components/streak-records-section";
import { streaksPanel } from "@/components/streaks-section";
import { TeamPageFold } from "@/components/team-page-fold";
import { canSeeAnalytics } from "@/lib/analytics-access";
import type { CleanSheetSeries } from "@/lib/clean-sheets";
import type { ComebacksSeries } from "@/lib/comebacks";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
import type { HomeAwaySeries } from "@/lib/home-away";
import type { PositionSeries } from "@/lib/position-series";
import type { SeasonComparisonSeries } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";
import type { StreaksSeries } from "@/lib/streaks";

/** Over every analytics panel on the team page, and over the one sign-in prompt (specs/031, A). */
export const ANALYTICS_HEADING = "Analyysit";
/** The three group headings agreed on #424. */
export const BY_MATCH_HEADING = "Ottelu ottelulta";
export const WHOLE_SEASON_HEADING = "Kausi kokonaisuutena";
export const OTHER_SEASONS_HEADING = "Muut kaudet";
/** About analytics as a whole, not one panel: signed-out readers see none of them (specs/030, A). */
export const SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi analyysit ja trendit.";

const HEADING_ID = "analytics";

/**
 * The team page's analytics: every panel under one heading (specs/031). Most
 * are charts; `Putket` (specs/035) and `Kääntyneet ottelut` (specs/036,
 * specs/037) are
 * lists of figures, which is why the parts are called panels here.
 *
 * **The gate comes first, and once.** A signed-out request gets the heading and
 * one sign-in prompt — not one per panel (Q5) — before any loader is called, so
 * its page is never computed from, and carries, any analytics value at all.
 *
 * Signed in, the series load together and each renders its own panel. `null`
 * when none applies, so a league season with no table shows no section.
 *
 * A server component awaited by the team pages rather than rendered, the shape
 * `CompetitionTeamPage` already uses.
 */
export async function AnalyticsSection({
  loadPosition,
  loadForm,
  loadGoals,
  loadHomeAway,
  loadCleanSheets,
  loadStreaks,
  loadComebacks,
  loadComparison,
  loadRecords,
}: Readonly<{
  loadPosition: () => Promise<PositionSeries>;
  loadForm: () => Promise<FormSeries>;
  loadGoals: () => Promise<GoalsSeries>;
  loadHomeAway: () => Promise<HomeAwaySeries>;
  loadCleanSheets: () => Promise<CleanSheetSeries>;
  loadStreaks: () => Promise<StreaksSeries>;
  loadComebacks: () => Promise<ComebacksSeries>;
  loadComparison: () => Promise<SeasonComparisonSeries>;
  loadRecords: () => Promise<StreakRecordsSeries>;
}>) {
  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const [position, form, goals, homeAway, cleanSheets, streaks, comebacks, comparison, records] =
    await Promise.all([
      loadPosition(),
      loadForm(),
      loadGoals(),
      loadHomeAway(),
      loadCleanSheets(),
      loadStreaks(),
      loadComebacks(),
      loadComparison(),
      loadRecords(),
    ]);
  const panels = {
    position: positionPanel(position),
    form: formPanel(form),
    rollingGoals: rollingGoalsPanel(goals),
    totalGoals: totalGoalsPanel(goals),
    homeAway: homeAwayPanel(homeAway),
    cleanSheets: cleanSheetsPanel(cleanSheets),
    streaks: streaksPanel(streaks),
    comebacks: comebacksPanel(comebacks),
    comparison: seasonComparisonPanel(comparison),
    records: streakRecordsPanel(records),
  };

  /**
   * The three groups agreed on #424, in the order the page shows them.
   *
   * They group by **the question a reader is asking**, not by the subject of
   * the measure: `Tämä kausi verrattuna` and `Ennätykset` each cover position,
   * points and goals at once, so a subject grouping would have needed a
   * non-subject group anyway.
   *
   * `Nollapelit` sits in the first group and `Koti- ja vierastilastot` at the
   * head of the second, which swaps the two against the order before this
   * change: a running share plotted match by match and a season summary belong
   * on opposite sides of that line.
   */
  const groups = [
    {
      heading: BY_MATCH_HEADING,
      id: "analytics-by-match",
      // Keyed by name rather than listed, so each panel carries a stable key
      // into the group and the membership stays one list rather than two.
      panels: {
        position: panels.position,
        form: panels.form,
        rollingGoals: panels.rollingGoals,
        totalGoals: panels.totalGoals,
        cleanSheets: panels.cleanSheets,
      },
    },
    {
      heading: WHOLE_SEASON_HEADING,
      id: "analytics-whole-season",
      panels: { homeAway: panels.homeAway, streaks: panels.streaks, comebacks: panels.comebacks },
    },
    {
      heading: OTHER_SEASONS_HEADING,
      id: "analytics-other-seasons",
      panels: { comparison: panels.comparison, records: panels.records },
    },
  ];
  // A group with nothing in it shows no heading: a cup season has no position
  // chart, and a club with one stored season has no `Muut kaudet` content.
  const shown = groups.filter((group) =>
    Object.values(group.panels).some((panel) => panel !== null)
  );
  if (shown.length === 0) return null;

  return (
    <Section>
      {shown.map((group) => (
        <PanelGroup heading={group.heading} headingId={group.id} key={group.id}>
          {Object.entries(group.panels).map(([name, panel]) => (
            <Fragment key={name}>{panel}</Fragment>
          ))}
        </PanelGroup>
      ))}
    </Section>
  );
}

/**
 * One group of panels under `Analyysit` (#424): a region named by its own
 * heading, so a screen reader can move between groups as it moves between
 * panels.
 */
function PanelGroup({
  heading,
  headingId,
  children,
}: Readonly<{ heading: string; headingId: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 className="font-medium text-muted text-sm uppercase tracking-wide" id={headingId}>
        {heading}
      </h3>
      {children}
    </section>
  );
}

/** Foldable, like the match list above it (#416). */
function Section({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TeamPageFold heading={ANALYTICS_HEADING} headingId={HEADING_ID}>
      {children}
    </TeamPageFold>
  );
}
