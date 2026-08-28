import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { matchCountLabel, type NationalTeam } from "@/lib/national-team";
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
 * until the reader chooses to hide it. See specs/017-huuhkajat.md.
 */
function YearSection({ year }: Readonly<{ year: NationalTeamYear }>) {
  return (
    <details className="mb-10 border-zinc-200 border-b pb-4" open>
      <summary className="mb-3 cursor-pointer list-none">
        <h2 className="inline font-semibold text-xl">{year.year}</h2>
        <span className="ml-2 text-sm text-zinc-500">{`(${matchCountLabel(year.matches.length)})`}</span>
      </summary>
      <MatchListTable
        matches={year.matches}
        teamHref={null}
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

  return (
    <PageShell heading={team.displayName}>
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" && result.incomplete && <Notice>{INCOMPLETE_MESSAGE}</Notice>}
      {result.status === "ok" &&
        result.years.map((year) => <YearSection key={year.year} year={year} />)}
    </PageShell>
  );
}
