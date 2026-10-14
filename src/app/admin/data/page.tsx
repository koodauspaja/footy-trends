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
 * `/yllapito/data`. Privileged and per-request, so it can never be prerendered.
 *
 * decisions/028-admin-tools-and-roles.md
 * decisions/029-forced-season-refresh.md
 */
export const dynamic = "force-dynamic";

export default async function RefreshData() {
  // The not-found page, never a 403, on the same terms as `/yllapito`. The
  // status is 200, as the response streams; `requireAdmin()` is what refuses.
  const adminId = await requireAdmin();
  if (adminId === null) notFound();

  const { domestic, foreign } = listCompetitionOptions();

  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns();
  } catch (error) {
    // A failed read is not an empty log: `Ei aiempia päivityksiä.` would claim
    // nothing has ever been refreshed.
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
