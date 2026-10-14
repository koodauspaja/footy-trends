import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminUserTable } from "@/components/admin-user-table";
import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { pageFrom } from "@/lib/admin-user-view";
import { listUsers } from "@/lib/admin-users";
import { logger } from "@/lib/logger";

const HEADING = "Ylläpito";
/**
 * The link to the forced season refresh.
 *
 * decisions/029-forced-season-refresh.md
 */
const REFRESH_LINK = "Kauden uudelleenhaku";

/**
 * `/yllapito`. Per-reader and privileged, so it can never be prerendered.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export const dynamic = "force-dynamic";

/**
 * The page number lives in the URL, in Finnish. It is read through `pageFrom`,
 * which treats anything that is not a positive decimal integer as page one.
 *
 * decisions/028-admin-tools-and-roles.md
 */
const PAGE_PARAM = "sivu";

export default async function Admin({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  // The not-found page, never a 403, and with status 200: the response streams.
  // `notFound()` throws, so nothing below runs and no query is made for a caller
  // who may not see the answer.
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
      {/* Above the table rather than below it: the user list runs to fifty rows
          and a link under it would be out of sight. */}
      <p className="mb-6">
        <Link className="text-sm underline" href="/yllapito/data">
          {REFRESH_LINK}
        </Link>
      </p>
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
