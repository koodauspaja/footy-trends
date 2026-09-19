import { formPanel } from "@/components/form-section";
import { rollingGoalsPanel, totalGoalsPanel } from "@/components/goals-section";
import { homeAwayPanel } from "@/components/home-away-section";
import { positionPanel } from "@/components/league-position-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { TeamPageFold } from "@/components/team-page-fold";
import { canSeeAnalytics } from "@/lib/analytics-access";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
import type { HomeAwaySeries } from "@/lib/home-away";
import type { PositionSeries } from "@/lib/position-series";

/** Over every chart on the team page, and over the one sign-in prompt (specs/031, A). */
export const ANALYTICS_HEADING = "Analyysit";
/** About analytics as a whole, not one chart: signed-out readers see none of them (specs/030, A). */
export const SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi analyysit ja trendit.";

const HEADING_ID = "analytics";

/**
 * The team page's analytics: every chart under one heading (specs/031).
 *
 * **The gate comes first, and once.** A signed-out request gets the heading and
 * one sign-in prompt — not one per chart (Q5) — before any loader is called, so
 * its page is never computed from, and carries, any analytics value at all.
 *
 * Signed in, the charts load together and each renders its own panel. `null`
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
}: Readonly<{
  loadPosition: () => Promise<PositionSeries>;
  loadForm: () => Promise<FormSeries>;
  loadGoals: () => Promise<GoalsSeries>;
  loadHomeAway: () => Promise<HomeAwaySeries>;
}>) {
  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const [position, form, goals, homeAway] = await Promise.all([
    loadPosition(),
    loadForm(),
    loadGoals(),
    loadHomeAway(),
  ]);
  const charts = {
    position: positionPanel(position),
    form: formPanel(form),
    rollingGoals: rollingGoalsPanel(goals),
    totalGoals: totalGoalsPanel(goals),
    homeAway: homeAwayPanel(homeAway),
  };
  if (Object.values(charts).every((chart) => chart === null)) return null;

  return (
    <Section>
      {charts.position}
      {charts.form}
      {charts.rollingGoals}
      {charts.totalGoals}
      {charts.homeAway}
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
