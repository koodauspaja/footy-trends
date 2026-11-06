import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteView } from "@/components/guessing-game-groups";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { currentUserId } from "@/lib/current-user";
import { isInviteToken } from "@/lib/guessing-game-group";
import { groupPath } from "@/lib/guessing-game-group-paths";
import { type Invite, readInvite } from "@/lib/guessing-game-group-store";
import { logger } from "@/lib/logger";

const HEADING = "Arvauspeli";

export const metadata: Metadata = { title: "Kutsu arvauspelin ryhmään" };

/**
 * Per-reader, so it can never be prerendered.
 *
 * decisions/078-private-groups.md
 */
export const dynamic = "force-dynamic";

/**
 * `/arvauspeli/liity/{token}`: the page an invite link opens. A member already
 * in the group goes straight to its page; a link that names no group says it
 * is not valid, and nothing of any group.
 *
 * decisions/078-private-groups.md
 */
export default async function InviteRoute({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  let invite: Invite | null = null;
  let signedIn = false;
  try {
    if (isInviteToken(token)) {
      const userId = await currentUserId();
      signedIn = userId !== null;
      invite = await readInvite(userId, token);
    }
  } catch (error) {
    logger.error({ err: error }, "Reading an Arvauspeli invite failed");
    return (
      <PageShell heading={HEADING}>
        <Notice>Kutsun lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }
  if (invite?.member === true) redirect(groupPath(invite.groupId));
  return (
    <PageShell heading={HEADING}>
      <InviteView invite={invite} signedIn={signedIn} token={token} />
    </PageShell>
  );
}
