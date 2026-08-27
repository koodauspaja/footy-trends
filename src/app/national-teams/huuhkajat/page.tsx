import type { Metadata } from "next";
import { MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { matchCountLabel } from "@/lib/huuhkajat";
import { getHuuhkajatYears, type HuuhkajatYear } from "@/lib/huuhkajat-service";

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
function YearSection({ year }: Readonly<{ year: HuuhkajatYear }>) {
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
 * Every Huuhkajat match from 2021, on one page.
 *
 * No season selector: the whole history is 85 matches, so a reader scrolls
 * rather than stepping through six dropdown choices. See
 * specs/017-huuhkajat.md.
 */
export default async function Huuhkajat() {
  const result = await getHuuhkajatYears();

  return (
    <PageShell heading={HEADING}>
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" &&
        result.years.map((year) => <YearSection key={year.year} year={year} />)}
    </PageShell>
  );
}
