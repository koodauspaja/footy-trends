"use client";

/**
 * `Arvauspeli`'s group controls: creating, joining, copying the link, and the
 * actions behind a confirmation. Each calls its server action, then refreshes
 * or leaves the page, which reads the group again on the server.
 *
 * decisions/078-private-groups.md
 */

import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import {
  createGroupAction,
  deleteGroupAction,
  type GroupActionRefusal,
  type GroupActionResult,
  joinGroupAction,
  leaveGroupAction,
  removeMemberAction,
  renameGroupAction,
  renewInviteLinkAction,
} from "@/lib/guessing-game-group-actions";
import { groupPath, invitePath } from "@/lib/guessing-game-group-paths";
import { reportClientError } from "@/lib/report-client-error";

const BUTTON =
  "rounded border border-border px-3 py-2 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";
const FIELD = "rounded border border-border px-2 py-1 text-sm";

/**
 * What each refusal says. `stale` is never shown: the page reloads instead.
 *
 * decisions/078-private-groups.md
 */
const REFUSALS: Readonly<Record<Exclude<GroupActionRefusal, "stale">, string>> = {
  "name-length": "Ryhmän nimen pituus on 3–30 merkkiä.",
  "name-characters":
    "Ryhmän nimessä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _ ja .",
  "word-list": "Valitse ryhmälle toinen nimi.",
  full: "Ryhmä on täynnä (50 jäsentä).",
  "group-limit": "Voit kuulua enintään 10 ryhmään.",
  "invalid-link": "Kutsulinkki ei ole voimassa. Pyydä ryhmän jäseneltä uusi linkki.",
  failed: "Ryhmän tallentaminen epäonnistui. Yritä uudelleen.",
};

/**
 * Runs a group action in a transition: on success `then` with its result, on
 * `stale` a refresh, otherwise the refusal's line, and a thrown call as failed.
 *
 * decisions/078-private-groups.md
 */
function useGroupAction(source: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const run = <R extends object>(
    action: () => Promise<GroupActionResult<R>>,
    then: (result: R) => void
  ) => {
    setRefusal(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) then(result);
        else if (result.reason === "stale") router.refresh();
        else setRefusal(REFUSALS[result.reason]);
      } catch (error) {
        reportClientError(error, `guessing-game.group.${source}`);
        setRefusal(REFUSALS.failed);
      }
    });
  };
  return { router, pending, refusal, run };
}

function Refusal({ refusal }: Readonly<{ refusal: string | null }>) {
  return refusal === null ? null : (
    <p className="text-sm" role="alert">
      {refusal}
    </p>
  );
}

/**
 * A name field with its button, for creating a group or renaming one. With a
 * `confirm` question the save waits for a confirmation, shown under the field.
 *
 * decisions/078-private-groups.md
 */
function NameForm<R extends object>({
  button,
  initial,
  source,
  save,
  then,
  confirm,
}: Readonly<{
  button: string;
  initial: string;
  source: string;
  save: (name: string) => Promise<GroupActionResult<R>>;
  then: (result: R, router: ReturnType<typeof useRouter>) => void;
  confirm?: ((name: string) => string) | undefined;
}>) {
  const id = useId();
  const questionId = useId();
  const [name, setName] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const { router, pending, refusal, run } = useGroupAction(source);
  const send = () =>
    run(
      () => save(name),
      (result) => then(result, router)
    );
  return (
    <form
      className="mt-3 flex flex-col items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm === undefined) send();
        else setConfirming(true);
      }}
    >
      <label className="text-sm" htmlFor={id}>
        Ryhmän nimi
      </label>
      <span className="flex flex-wrap gap-2">
        <input
          className={FIELD}
          id={id}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <button className={BUTTON} disabled={pending} type="submit">
          {button}
        </button>
      </span>
      {confirming && confirm !== undefined && (
        <div
          aria-labelledby={questionId}
          className="rounded border border-border p-3"
          role="alertdialog"
        >
          <p className="font-semibold" id={questionId}>
            {confirm(name)}
          </p>
          <span className="mt-2 flex gap-3">
            <button
              className="underline"
              onClick={() => {
                setConfirming(false);
                send();
              }}
              type="button"
            >
              {button}
            </button>
            <button className="underline" onClick={() => setConfirming(false)} type="button">
              Peruuta
            </button>
          </span>
        </div>
      )}
      <Refusal refusal={refusal} />
    </form>
  );
}

export function CreateGroupForm() {
  return (
    <NameForm
      button="Perusta ryhmä"
      initial=""
      save={createGroupAction}
      source="create"
      then={({ groupId }, router) => router.push(groupPath(groupId))}
    />
  );
}

export function RenameGroupForm({ groupId, name }: Readonly<{ groupId: number; name: string }>) {
  return (
    <NameForm
      button="Tallenna nimi"
      confirm={(next) => `Muutetaanko ryhmän nimeksi ${next}?`}
      initial={name}
      save={(next) => renameGroupAction(groupId, next)}
      source="rename"
      then={(_result, router) => router.refresh()}
    />
  );
}

/**
 * Joins the group a link names, and the game too for a reader not yet playing,
 * then opens the group's page.
 *
 * decisions/078-private-groups.md
 */
export function JoinGroupButton({ token, player }: Readonly<{ token: string; player: boolean }>) {
  const { router, pending, refusal, run } = useGroupAction("join");
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className={BUTTON}
        disabled={pending}
        onClick={() =>
          run(
            () => joinGroupAction(token),
            ({ groupId }) => router.push(groupPath(groupId))
          )
        }
        type="button"
      >
        {player ? "Liity ryhmään" : "Liity peliin ja ryhmään"}
      </button>
      <Refusal refusal={refusal} />
    </div>
  );
}

function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * The invite link in full, by the address the reader is on; on the server,
 * before the browser has it, the path alone.
 *
 * decisions/078-private-groups.md
 */
function useInviteUrl(token: string): string {
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => ""
  );
  return `${origin}${invitePath(token)}`;
}

export function InviteLink({ token }: Readonly<{ token: string }>) {
  const url = useInviteUrl(token);
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <code className="break-all text-sm">{url}</code>
      <button
        className={BUTTON}
        onClick={() => {
          // Through a promise, so a browser with no clipboard, which throws
          // at once, is answered as a refused copy.
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(url))
            .then(
              () => setCopied(true),
              (error: unknown) => {
                reportClientError(error, "guessing-game.group.copy");
                setCopied(false);
              }
            );
        }}
        type="button"
      >
        Kopioi linkki
      </button>
      {copied === true && <p className="text-sm">Linkki kopioitu.</p>}
      {copied === false && (
        <p className="text-sm" role="alert">
          Kopiointi epäonnistui. Kopioi linkki yllä olevasta tekstistä.
        </p>
      )}
    </div>
  );
}

/**
 * A button whose action waits for a confirmation, shown in place under it.
 *
 * decisions/078-private-groups.md
 */
function ConfirmButton({
  label,
  question,
  note,
  source,
  action,
  then,
}: Readonly<{
  label: string;
  question: string;
  note?: string | undefined;
  source: string;
  action: () => Promise<GroupActionResult>;
  then: (router: ReturnType<typeof useRouter>) => void;
}>) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const { router, pending, refusal, run } = useGroupAction(source);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className={BUTTON}
        disabled={pending}
        onClick={() => setConfirming(true)}
        type="button"
      >
        {label}
      </button>
      {confirming && (
        <div aria-labelledby={id} className="rounded border border-border p-3" role="alertdialog">
          <p className="font-semibold" id={id}>
            {question}
          </p>
          {note !== undefined && <p className="mt-1 text-muted text-sm">{note}</p>}
          <span className="mt-2 flex gap-3">
            <button
              className="underline disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                run(action, () => then(router));
              }}
              type="button"
            >
              {label}
            </button>
            <button className="underline" onClick={() => setConfirming(false)} type="button">
              Peruuta
            </button>
          </span>
        </div>
      )}
      <Refusal refusal={refusal} />
    </div>
  );
}

const toGame = (router: ReturnType<typeof useRouter>) => router.push("/arvauspeli");
const refresh = (router: ReturnType<typeof useRouter>) => router.refresh();

export function RenewLinkButton({ groupId }: Readonly<{ groupId: number }>) {
  return (
    <ConfirmButton
      action={() => renewInviteLinkAction(groupId)}
      label="Uusi linkki"
      question="Vanha linkki lakkaa toimimasta. Jatketaanko?"
      source="renew"
      then={refresh}
    />
  );
}

export function LeaveGroupButton({
  groupId,
  name,
  passesOn,
}: Readonly<{ groupId: number; name: string; passesOn: boolean }>) {
  return (
    <ConfirmButton
      action={() => leaveGroupAction(groupId)}
      label="Poistu ryhmästä"
      note={passesOn ? "Omistajuus siirtyy ryhmän pisimpään jäsenenä olleelle." : undefined}
      question={`Poistutaanko ryhmästä ${name}?`}
      source="leave"
      then={toGame}
    />
  );
}

export function RemoveMemberButton({
  groupId,
  membershipId,
  nickname,
}: Readonly<{ groupId: number; membershipId: number; nickname: string }>) {
  return (
    <ConfirmButton
      action={() => removeMemberAction(groupId, membershipId)}
      label="Poista ryhmästä"
      question={`Poistetaanko ${nickname} ryhmästä?`}
      source="remove"
      then={refresh}
    />
  );
}

export function DeleteGroupButton({ groupId, name }: Readonly<{ groupId: number; name: string }>) {
  return (
    <ConfirmButton
      action={() => deleteGroupAction(groupId)}
      label="Poista ryhmä"
      question={`Poistetaanko ryhmä ${name}? Ryhmän tulostaulukko katoaa, pelimerkit eivät.`}
      source="delete"
      then={toGame}
    />
  );
}
