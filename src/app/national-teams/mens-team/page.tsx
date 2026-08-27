import type { Metadata } from "next";
import { MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { matchCountLabel } from "@/lib/mens-team";
import { getMensTeamYears, type MensTeamYear } from "@/lib/mens-team-service";

const HEADING = "Huuhkajat";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

export const metadata: Metadata = { title: HEADING };

/**
 * One year, collapsible.
 *
 * `<details>` rather than client-side state, the same shape the Finnish cups
 * use for rounds — and open by default for the same reason: nothing is hidden
 * until the reader chooses to hide it. See specs/017-huuhkajat.md.
 */
function YearSection({ year }: Readonly<{ year: MensTeamYear }>) {
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
 * Every Huuhkajat match from 2019 onward, on one page.
 *
 * No season selector: the whole history is 85 matches, so a reader scrolls
 * rather than stepping through a dropdown. Sections are calendar years, which
 * is not the same as the provider's season buckets — `maajp18` alone spans
 * 2019, 2020 and 2021. See specs/017-huuhkajat.md.
 */
export default async function MensTeam() {
  const result = await getMensTeamYears();

  return (
    <PageShell heading={HEADING}>
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" &&
        result.years.map((year) => <YearSection key={year.year} year={year} />)}
    </PageShell>
  );
}
