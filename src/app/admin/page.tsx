import { notFound } from "next/navigation";
import { AdminUserTable } from "@/components/admin-user-table";
import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { pageFrom } from "@/lib/admin-user-view";
import { listUsers } from "@/lib/admin-users";
import { logger } from "@/lib/logger";

const HEADING = "Ylläpito";

/**
 * `/yllapito`, from specs/028-admin-tools-and-roles.md.
 *
 * Per-reader and privileged, so it can never be prerendered — a build artefact
 * of this page would contain every user's email address.
 */
export const dynamic = "force-dynamic";

/**
 * The page number lives in the URL, in Finnish, like every other reader-facing
 * path in this app. It is read through `pageFrom`, which treats anything that
 * is not a positive decimal integer as page one.
 */
const PAGE_PARAM = "sivu";

export default async function Admin({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  /**
   * **The not-found page, never a 403.** A 403 says "this exists and you may
   * not have it", which is a fact a stranger has no use for. Everyone refused
   * gets the same generic page: no admin markup, no admin title, nothing that
   * distinguishes it from any other missing URL in the body.
   *
   * **The status is 200, not 404, and that is a framework limit rather than a
   * choice.** `src/app/loading.tsx` puts every segment behind a Suspense
   * boundary, so the response streams and Next commits the status line before
   * `notFound()` is caught — its documentation says "200 for streamed
   * responses, and 404 for non-streamed". So `/yllapito` is identifiable as a
   * real route by status alone.
   *
   * A proxy was built to close that and deleted again: it could only read the
   * session *cookie*, not validate it, so `Cookie: better-auth.session_token=x`
   * walked straight through — measured, 200 against the 404 an absent cookie
   * got. Machinery whose stated purpose it does not achieve is worse than none.
   *
   * What actually refuses is `requireAdmin()`, here and on every action. The
   * route being discoverable costs an attacker one fact and gains them nothing.
   *
   * `notFound()` throws a Next control-flow signal, so nothing below runs and
   * no query is made for a caller who may not see the answer.
   */
  const adminId = await requireAdmin();
  if (adminId === null) notFound();

  const requested = pageFrom((await searchParams)[PAGE_PARAM]);

  let page: Awaited<ReturnType<typeof listUsers>>;
  try {
    page = await listUsers(requested);
  } catch (error) {
    // A failed read is not an empty list. Rendering "Ei käyttäjiä." here would
    // tell an admin the app has no users, which is a claim we cannot make from
    // a database error.
    logger.error({ err: error, adminId }, "Reading the user list failed");
    throw error;
  }

  return (
    <PageShell heading={HEADING}>
      <AdminUserTable
        currentAdminId={adminId}
        page={page.page}
        pageParam={PAGE_PARAM}
        pages={page.pages}
        total={page.total}
        users={page.users}
      />
    </PageShell>
  );
}
