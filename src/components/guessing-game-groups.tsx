/**
 * `Arvauspeli`'s private groups as a reader sees them: the `Ryhmät` section of
 * `/arvauspeli`, a group's own page, and the page an invite link opens.
 *
 * decisions/078-private-groups.md
 */

import Link from "next/link";
import { BoardTable } from "@/components/guessing-game-board-table";
import { GameFold } from "@/components/guessing-game-fold";
import {
  CreateGroupForm,
  DeleteGroupButton,
  InviteLink,
  JoinGroupButton,
  LeaveGroupButton,
  RemoveMemberButton,
  RenameGroupForm,
  RenewLinkButton,
} from "@/components/guessing-game-group-controls";
import { PANEL_HEADING, TABLE_HEADING } from "@/components/heading-classes";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { MAX_GROUPS } from "@/lib/guessing-game-group";
import { groupPath } from "@/lib/guessing-game-group-paths";
import type { GroupPage, GroupSummary, Invite } from "@/lib/guessing-game-group-store";

function memberCount(count: number): string {
  return count === 1 ? "1 jäsen" : `${count} jäsentä`;
}

const NO_NICKNAME = "Nimetön pelaaja";

/**
 * What the game is, said to a reader who has not joined it, here and on
 * `/arvauspeli`.
 *
 * decisions/072-match-guesses.md
 * decisions/078-private-groups.md
 */
export const INTRO =
  "Arvaa Veikkausliigan otteluiden tuloksia pelimerkeillä. Pelimerkkejä ei voi ostaa, myydä eikä vaihtaa mihinkään.";

/**
 * `Ryhmät` on `/arvauspeli`: the player's groups with their rank in each, and
 * the form to create one while under the limit. A failed read says so.
 *
 * decisions/078-private-groups.md
 */
export function GroupsSection({ groups }: Readonly<{ groups: GroupSummary[] | "error" }>) {
  if (groups === "error") {
    return (
      <section className="mt-8">
        <h2 className={TABLE_HEADING}>Ryhmät</h2>
        <p className="mt-2">Ryhmien lataaminen epäonnistui. Yritä myöhemmin uudelleen.</p>
      </section>
    );
  }
  return (
    <GameFold count={String(groups.length)} heading="Ryhmät" id="groups" open>
      {groups.length === 0 ? (
        <p className="mt-2">
          Et kuulu vielä yhteenkään ryhmään. Perusta ryhmä ja kutsu kaverisi mukaan linkillä.
        </p>
      ) : (
        <ul>
          {groups.map((group) => (
            <li className="border-border-subtle border-b py-2" key={group.groupId}>
              <Link href={groupPath(group.groupId)}>{group.name}</Link>
              <span className="text-muted text-sm">
                {" "}
                · {memberCount(group.members)} ·{" "}
                {group.rank === null ? "ei vielä sijaa" : `sijasi ${group.rank}.`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {groups.length < MAX_GROUPS ? (
        <CreateGroupForm />
      ) : (
        <p className="mt-3 text-sm">Voit kuulua enintään {MAX_GROUPS} ryhmään.</p>
      )}
    </GameFold>
  );
}

function GroupBoard({ group }: Readonly<{ group: GroupPage }>) {
  const { board } = group;
  if (board === null) return <p className="mt-2">Kausi ei ole vielä alkanut.</p>;
  const waiting = group.members.length - board.players;
  return (
    <>
      {board.players > 0 && <BoardTable board={board} />}
      {waiting > 0 && (
        <p className="mt-2 text-sm">{memberCount(waiting)} ei ole vielä arvannut tällä kaudella.</p>
      )}
    </>
  );
}

/**
 * A group's page for one of its members: its board, its members, the invite
 * link, and what the member, or the owner, can do.
 *
 * decisions/078-private-groups.md
 */
export function GroupPageView({ group }: Readonly<{ group: GroupPage }>) {
  const owner = group.members.find((member) => member.owner);
  return (
    <div>
      <p className="text-muted text-sm">
        {memberCount(group.members.length)} · omistaja {owner?.nickname ?? NO_NICKNAME}
      </p>
      <section className="mt-6">
        <h2 className={TABLE_HEADING}>Tulostaulukko</h2>
        <GroupBoard group={group} />
      </section>
      <section className="mt-8">
        <h2 className={TABLE_HEADING}>Jäsenet</h2>
        <ul>
          {group.members.map((member) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 border-border-subtle border-b py-2"
              key={member.membershipId}
            >
              <span>
                {member.nickname ?? NO_NICKNAME}
                {member.self && <span className="text-muted"> (sinä)</span>}
                {member.owner && <span className="text-muted"> · omistaja</span>}
              </span>
              {group.isOwner && !member.self && (
                <RemoveMemberButton
                  groupId={group.groupId}
                  membershipId={member.membershipId}
                  nickname={member.nickname ?? NO_NICKNAME}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8 flex flex-col items-start gap-3">
        <h2 className={TABLE_HEADING}>Kutsulinkki</h2>
        <p className="text-sm">
          Kuka tahansa linkin saanut kirjautunut käyttäjä voi liittyä ryhmään.
        </p>
        <InviteLink token={group.inviteToken} />
        {group.isOwner && <RenewLinkButton groupId={group.groupId} />}
      </section>
      {group.isOwner && (
        <section className="mt-8">
          <h2 className={PANEL_HEADING}>Nimeä ryhmä uudelleen</h2>
          <RenameGroupForm groupId={group.groupId} name={group.name} />
        </section>
      )}
      <section className="mt-8 flex flex-col items-start gap-3">
        <LeaveGroupButton
          groupId={group.groupId}
          name={group.name}
          passesOn={group.isOwner && group.members.length > 1}
        />
        {group.isOwner && <DeleteGroupButton groupId={group.groupId} name={group.name} />}
      </section>
      <p className="mt-8 text-sm">
        <Link href="/arvauspeli">Takaisin arvauspeliin</Link>
      </p>
    </div>
  );
}

/**
 * What an invite link opens: the group, and a way to sign in or to join it;
 * for a link that names no group, that it is not valid, and no name.
 *
 * decisions/078-private-groups.md
 */
export function InviteView({
  invite,
  signedIn,
  token,
}: Readonly<{ invite: Invite | null; signedIn: boolean; token: string }>) {
  if (invite === null) {
    return <p>Kutsulinkki ei ole voimassa. Pyydä ryhmän jäseneltä uusi linkki.</p>;
  }
  if (!signedIn) {
    return <SignInPrompt message={`Kirjaudu sisään liittyäksesi ryhmään ${invite.name}.`} />;
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <p>
        Sinut on kutsuttu ryhmään {invite.name} ({memberCount(invite.members)}).
      </p>
      {!invite.player && <p className="text-sm">{INTRO}</p>}
      <JoinGroupButton player={invite.player} token={token} />
    </div>
  );
}
