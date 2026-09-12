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
   * **404, not 403.** A 403 confirms the page is there, which is a fact a
   * stranger has no use for.
   *
   * A signed-out visitor never reaches this line: `src/proxy.ts` answers them
   * before the response streams, because `notFound()` cannot change a status
   * the stream has already committed. What reaches here is a signed-in
   * non-admin, who gets the not-found *body* with a 200 — no admin markup and
   * no admin title, so nothing about the page leaks, though the status does
   * differ from a missing URL. That trade is recorded in the spec.
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
