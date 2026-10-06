import type { RefreshFailureReason, RefreshRunView, RowCounts } from "@/lib/refresh-view";

/**
 * What has been refreshed before. A server component: it renders data and
 * offers no control.
 *
 * decisions/029-forced-season-refresh.md
 */

const SECTION = "Aiemmat päivitykset";
const COLUMN_TIME = "Aika";
const COLUMN_COMPETITION = "Sarja";
const COLUMN_SEASON = "Kausi";
const COLUMN_RESULT = "Tulos";
const COLUMN_MATCHES = "Ottelut";
const COLUMN_STANDINGS = "Sarjataulukko";
const COLUMN_DEDUCTIONS = "Pistevähennyksiä";
const COLUMN_ACTOR = "Tekijä";
const SUCCEEDED = "Onnistui";
const FAILED = "Epäonnistui";
const DELETED_USER = "Poistettu käyttäjä";
const EMPTY = "Ei aiempia päivityksiä.";
/**
 * Shown where a provider has no group standings at all.
 *
 * decisions/029-forced-season-refresh.md
 */
const NOT_APPLICABLE = "—";

/**
 * Why a run failed, in the same words the form uses for the same refusal.
 * Keyed by the union, so a reason with no message is a type error.
 *
 * decisions/029-forced-season-refresh.md
 */
const REASONS: Record<RefreshFailureReason, string> = {
  input: "Pyyntö oli virheellinen.",
  stale: "Tiedot muuttuivat haun jälkeen.",
  cache: "Välimuistia ei voitu tyhjentää.",
  provider: "Palvelu ei vastannut.",
  empty: "Palvelu ei palauttanut tälle kaudelle mitään.",
  read: "Tallennettujen tietojen luku epäonnistui.",
  write: "Tallennus epäonnistui.",
};

const timeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A run's counts, as `1 / 2 / 0` with a spelled-out version beside it in
 * visually hidden text.
 *
 * decisions/029-forced-season-refresh.md
 */
function Counts({ counts }: Readonly<{ counts: RowCounts | null }>) {
  if (counts === null) {
    return (
      <>
        <span aria-hidden="true">{NOT_APPLICABLE}</span>
        <span className="sr-only">Ei sarjataulukkoa</span>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">{`${counts.inserted} / ${counts.updated} / ${counts.deleted}`}</span>
      <span className="sr-only">
        {`${counts.inserted} uutta, ${counts.updated} muuttunutta, ${counts.deleted} poistettua`}
      </span>
    </>
  );
}

type Props = Readonly<{ runs: RefreshRunView[] }>;

export function RefreshRunList({ runs }: Props) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-semibold text-lg">{SECTION}</h2>

      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{EMPTY}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">{COLUMN_TIME}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_COMPETITION}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_SEASON}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_RESULT}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_MATCHES}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_STANDINGS}</th>
                <th className="py-2 pr-4 font-medium">{COLUMN_DEDUCTIONS}</th>
                <th className="py-2 font-medium">{COLUMN_ACTOR}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr className="border-b last:border-0" key={run.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {timeFormatter.format(new Date(run.createdAt))}
                  </td>
                  <td className="py-2 pr-4">{run.competitionName}</td>
                  <td className="py-2 pr-4">{run.seasonLabel}</td>
                  <td className="py-2 pr-4">
                    {run.succeeded ? SUCCEEDED : FAILED}
                    {run.succeeded || run.reason === null ? null : (
                      <span className="block text-muted-foreground text-xs">
                        {REASONS[run.reason]}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <Counts counts={run.matches} />
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <Counts counts={run.groupRows} />
                  </td>
                  <td className="py-2 pr-4">{run.deductionsChanged}</td>
                  {/* Null once the account is gone: `run_by` is
                      `on delete set null`, so the record outlives the person
                      without naming them. */}
                  <td className="py-2">{run.runByName ?? DELETED_USER}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
