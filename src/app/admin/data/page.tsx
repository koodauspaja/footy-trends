import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { RefreshForm } from "@/components/refresh-form";
import { RefreshRunList } from "@/components/refresh-run-list";
import { requireAdmin } from "@/lib/admin-guard";
import { logger } from "@/lib/logger";
import { listCompetitionOptions } from "@/lib/refresh-competitions";
import { listRuns } from "@/lib/refresh-runs";

const HEADING = "Kauden uudelleenhaku";
const INTRO =
  "Hakee yhden sarjan ja kauden tiedot palvelusta uudelleen ja näyttää, miten ne muuttuisivat. Mitään ei kirjoiteta ennen kuin hyväksyt muutokset.";

/**
 * `/yllapito/data`, from specs/029-forced-season-refresh.md.
 *
 * Privileged and per-request, so it can never be prerendered.
 */
export const dynamic = "force-dynamic";

export default async function RefreshData() {
  /**
   * **The not-found page, never a 403** — the same terms as `/yllapito`, and
   * for the same reason: a 403 says "this exists and you may not have it",
   * which is a fact a stranger has no use for.
   *
   * The status is 200 rather than 404, which is a framework limit rather than a
   * choice: `src/app/loading.tsx` puts every segment behind a Suspense
   * boundary, so the response streams and Next commits the status line before
   * `notFound()` is caught. The body gives nothing away, and `requireAdmin()`
   * is what actually refuses — here and, separately, inside all three actions.
   * See specs/028-admin-tools-and-roles.md.
   */
  const adminId = await requireAdmin();
  if (adminId === null) notFound();

  const { domestic, foreign } = listCompetitionOptions();

  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns();
  } catch (error) {
    // A failed read is not an empty log. Rendering "Ei aiempia päivityksiä."
    // here would tell an admin nothing has ever been refreshed, which is a
    // claim we cannot make from a database error — and this page exists partly
    // so they can trust that list.
    logger.error({ err: error, adminId }, "Reading the refresh run log failed");
    throw error;
  }

  return (
    <PageShell heading={HEADING}>
      <p className="mb-6 text-muted-foreground text-sm">{INTRO}</p>
      <RefreshForm domestic={domestic} foreign={foreign} />
      <RefreshRunList runs={runs} />
    </PageShell>
  );
}
