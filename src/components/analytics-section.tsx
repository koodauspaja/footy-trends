import { cleanSheetsPanel } from "@/components/clean-sheets-section";
import { comebacksPanel } from "@/components/comebacks-section";
import { formPanel } from "@/components/form-section";
import { rollingGoalsPanel, totalGoalsPanel } from "@/components/goals-section";
import { homeAwayPanel } from "@/components/home-away-section";
import { positionPanel } from "@/components/league-position-section";
import { seasonComparisonPanel } from "@/components/season-comparison-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
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
import type { StreaksSeries } from "@/lib/streaks";

/** Over every analytics panel on the team page, and over the one sign-in prompt (specs/031, A). */
export const ANALYTICS_HEADING = "Analyysit";
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
}: Readonly<{
  loadPosition: () => Promise<PositionSeries>;
  loadForm: () => Promise<FormSeries>;
  loadGoals: () => Promise<GoalsSeries>;
  loadHomeAway: () => Promise<HomeAwaySeries>;
  loadCleanSheets: () => Promise<CleanSheetSeries>;
  loadStreaks: () => Promise<StreaksSeries>;
  loadComebacks: () => Promise<ComebacksSeries>;
  loadComparison: () => Promise<SeasonComparisonSeries>;
}>) {
  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const [position, form, goals, homeAway, cleanSheets, streaks, comebacks, comparison] =
    await Promise.all([
      loadPosition(),
      loadForm(),
      loadGoals(),
      loadHomeAway(),
      loadCleanSheets(),
      loadStreaks(),
      loadComebacks(),
      loadComparison(),
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
  };
  if (Object.values(panels).every((panel) => panel === null)) return null;

  return (
    <Section>
      {panels.position}
      {panels.form}
      {panels.rollingGoals}
      {panels.totalGoals}
      {panels.homeAway}
      {panels.cleanSheets}
      {panels.streaks}
      {panels.comebacks}
      {panels.comparison}
    </Section>
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
