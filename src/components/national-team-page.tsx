import { AnalyticsSection } from "@/components/analytics-section";
import { FoldMarker } from "@/components/fold-marker";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { HISTORY_AXIS } from "@/lib/analytics-axis";
import { matchCountLabel, type NationalTeam } from "@/lib/national-team";
import { nationalTeamAnalytics } from "@/lib/national-team-analytics";
import { getNationalTeamYears, type NationalTeamYear } from "@/lib/national-team-service";

const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
/**
 * Deliberately names no year: which years are missing is what we do not know.
 *
 * decisions/017-huuhkajat.md
 */
const INCOMPLETE_MESSAGE = "Kaikkia otteluita ei voitu ladata. Osa kausista voi puuttua.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

/**
 * One year, collapsible with `<details>`, and open by default.
 *
 * decisions/017-huuhkajat.md
 * decisions/419-shared-fold-marker.md
 */
function YearSection({ year, basePath }: Readonly<{ year: NationalTeamYear; basePath: string }>) {
  return (
    <details className="group mb-10 border-border-subtle border-b pb-4" open>
      <summary className="mb-3 flex cursor-pointer list-none items-baseline gap-2">
        <FoldMarker />
        <h2 className="font-semibold text-xl">{year.year}</h2>
        <span className="text-sm text-muted">{`(${matchCountLabel(year.matches.length)})`}</span>
      </summary>
      <MatchListTable
        matches={year.matches}
        teamHref={null}
        matchHref={(match) => `${basePath}/ottelu/${match.providerMatchId}`}
        fourthColumn={{ header: "Kilpailu", render: (match) => match.competitionName }}
      />
    </details>
  );
}

/**
 * One national team's whole history on a page, grouped by the year each match
 * was played, with no season selector. Shared by both teams.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 * decisions/041-national-team-analytics.md
 */
export async function NationalTeamPage({ team }: Readonly<{ team: NationalTeam }>) {
  const result = await getNationalTeamYears(team);

  // Above the year list, once: the panels describe every year. The loaders stay
  // thunks, as the sign-in gate runs before any is called. A page that loaded
  // only some buckets still gets its analytics, over what did load.
  const analyticsSection =
    result.status === "ok"
      ? await AnalyticsSection({ axis: HISTORY_AXIS, ...nationalTeamAnalytics(result.years) })
      : null;

  return (
    <PageShell heading={team.displayName}>
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" && result.incomplete && <Notice>{INCOMPLETE_MESSAGE}</Notice>}
      {analyticsSection}
      {result.status === "ok" &&
        result.years.map((year) => (
          <YearSection basePath={team.basePath} key={year.year} year={year} />
        ))}
    </PageShell>
  );
}
