import { formPanel } from "@/components/form-section";
import { rollingGoalsPanel, totalGoalsPanel } from "@/components/goals-section";
import { positionPanel } from "@/components/league-position-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
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
}: Readonly<{
  loadPosition: () => Promise<PositionSeries>;
  loadForm: () => Promise<FormSeries>;
  loadGoals: () => Promise<GoalsSeries>;
}>) {
  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const [position, form, goals] = await Promise.all([loadPosition(), loadForm(), loadGoals()]);
  const charts = {
    position: positionPanel(position),
    form: formPanel(form),
    rollingGoals: rollingGoalsPanel(goals),
    totalGoals: totalGoalsPanel(goals),
  };
  if (Object.values(charts).every((chart) => chart === null)) return null;

  return (
    <Section>
      {charts.position}
      {charts.form}
      {charts.rollingGoals}
      {charts.totalGoals}
    </Section>
  );
}

function Section({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <section aria-labelledby={HEADING_ID} className="mt-8">
      <h2 className="mb-2 font-medium" id={HEADING_ID}>
        {ANALYTICS_HEADING}
      </h2>
      {children}
    </section>
  );
}
