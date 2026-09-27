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
 * Deliberately names no year. A failed bucket's matches were never read, and a
 * bucket is not one year — `maajp18` spans 2018 to 2021 — so which years are
 * missing is exactly what we do not know. Saying so beats naming a year that
 * might be complete. See #180.
 */
const INCOMPLETE_MESSAGE = "Kaikkia otteluita ei voitu ladata. Osa kausista voi puuttua.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

/**
 * One year, collapsible.
 *
 * `<details>` rather than client-side state, the same shape the Finnish cups
 * use for rounds — and open by default for the same reason: nothing is hidden
 * until the reader chooses to hide it. See specs/017-huuhkajat.md. The summary
 * shows the `FoldMarker` every fold shares (#419).
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
 * was played.
 *
 * No season selector: 85 matches for each team, so a reader
 * scrolls rather than stepping through a dropdown. Sections are calendar years,
 * which is not the same as the provider's season buckets — `maajp18` alone
 * spans four of them. See specs/018-helmarit.md.
 *
 * Shared by both teams, which differ only in the category suffix that selects
 * their matches and in what the page is called.
 */
export async function NationalTeamPage({ team }: Readonly<{ team: NationalTeam }>) {
  const result = await getNationalTeamYears(team);

  /**
   * Above the year list, once (specs/041, S5): the panels describe every year,
   * so they cannot sit inside one.
   *
   * The loaders are computed from `result.years` — rows already read — so the
   * section adds no query and no provider request. They stay thunks because
   * `AnalyticsSection` checks the sign-in gate before calling any of them, and
   * a signed-out page must carry no computed value at all.
   *
   * A page that loaded some buckets and not others still gets its analytics,
   * over what did load. The `incomplete` notice above already says the history
   * may be short, and a partial history is still a history — see #180 for the
   * same trade on the list itself.
   */
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
