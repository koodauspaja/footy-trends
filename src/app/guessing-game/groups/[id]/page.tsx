import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupPageView } from "@/components/guessing-game-groups";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { currentUserId } from "@/lib/current-user";
import { boardSeason } from "@/lib/guessing-game-board";
import { parseGroupId, parseMatchesShown } from "@/lib/guessing-game-group";
import { type GroupPage, readGroup } from "@/lib/guessing-game-group-store";
import { openGame } from "@/lib/guessing-game-store";
import { logger } from "@/lib/logger";

export const metadata: Metadata = { title: "Arvauspelin ryhmä" };

/**
 * Per-member, so it can never be prerendered.
 *
 * decisions/078-private-groups.md
 */
export const dynamic = "force-dynamic";

/**
 * `/arvauspeli/ryhmat/{id}`: a group's page for its members. Anyone else, and
 * an id that names no group, gets the same 404, so a group's existence is not
 * revealed; a signed-out reader is asked to sign in. `?ottelut=` is how many of
 * the members' guessed matches it lists.
 *
 * decisions/078-private-groups.md
 * decisions/079-group-members-guesses.md
 */
export default async function GroupRoute({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const groupId = parseGroupId((await params).id);
  const shown = parseMatchesShown((await searchParams).ottelut);
  if (groupId === null) notFound();
  let group: GroupPage | null;
  let userId: string | null = null;
  try {
    userId = await currentUserId();
    if (userId === null) {
      return (
        <PageShell heading="Arvauspeli">
          <SignInPrompt message="Kirjaudu sisään nähdäksesi ryhmän." />
        </PageShell>
      );
    }
    const now = new Date();
    const view = await openGame(userId, now);
    group = await readGroup(userId, groupId, boardSeason(view), { now, shown });
  } catch (error) {
    logger.error({ err: error, userId, groupId }, "Reading an Arvauspeli group failed");
    return (
      <PageShell heading="Arvauspeli">
        <Notice>Ryhmän lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }
  if (group === null) notFound();
  return (
    <PageShell heading={group.name}>
      <GroupPageView group={group} shown={shown} />
    </PageShell>
  );
}
