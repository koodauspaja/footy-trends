"use client";

import { useState, useTransition } from "react";
import { SameRouteLink } from "@/components/same-route-link";
import { deleteUserAction, demoteUserAction, promoteUserAction } from "@/lib/admin-actions";
import {
  type AdminRefusal,
  type AdminUser,
  type AdminWriteResult,
  isAdminRole,
} from "@/lib/admin-user-view";
import { reportClientError } from "@/lib/report-client-error";

/**
 * The user list and its controls. A client component: it imports
 * `admin-user-view.ts`, never `admin-users.ts`, which reaches the database.
 *
 * decisions/028-admin-tools-and-roles.md
 */

const SECTION = "Käyttäjät";
const COLUMN_EMAIL = "Sähköposti";
const COLUMN_NAME = "Nimi";
const COLUMN_ROLE = "Rooli";
const COLUMN_JOINED = "Liittynyt";
const COLUMN_ACTIONS = "Toiminnot";
const ROLE_ADMIN = "Ylläpitäjä";
const ROLE_USER = "Käyttäjä";
const PROMOTE = "Tee ylläpitäjäksi";
const DEMOTE = "Poista ylläpito-oikeudet";
const DELETE = "Poista tili";
const CANCEL = "Peruuta";
const EMPTY = "Ei käyttäjiä.";
const PREVIOUS = "Edellinen";
const NEXT = "Seuraava";
const CONFIRM_BODY = "Tämä poistaa tilin, suosikit, asetukset ja profiilikuvan. Tätä ei voi perua.";

/**
 * Every refusal the actions can report, in Finnish.
 *
 * decisions/028-admin-tools-and-roles.md
 */
const REFUSALS: Record<AdminRefusal, string> = {
  self: "Et voi muuttaa omaa rooliasi tai poistaa omaa tiliäsi täällä.",
  last_admin: "Viimeistä ylläpitäjää ei voi poistaa.",
  not_found: "Käyttäjää ei löytynyt. Lista on päivitetty.",
  failed: "Toiminto epäonnistui. Yritä uudelleen.",
};

const joinedFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

type Props = Readonly<{
  users: AdminUser[];
  /** The signed-in admin, so their own row offers no controls. */
  currentAdminId: string;
  /** Which page is shown, how many there are, and how many users in total. */
  page: number;
  pages: number;
  total: number;
  /** The query parameter carrying the page, so the links and the page agree. */
  pageParam: string;
}>;

export function AdminUserTable({ users, currentAdminId, page, pages, total, pageParam }: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminUser | null>(null);

  const run = (action: () => Promise<AdminWriteResult>) => {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        // A refusal leaves the row as it was and says why; the page revalidates
        // itself on success, so there is no local copy of the list to keep.
        if (!result.ok) setNotice(REFUSALS[result.reason]);
      } catch (error) {
        reportClientError(error, "admin.user-write");
        setNotice(REFUSALS.failed);
      }
    });
  };

  return (
    <section>
      {/* The heading and the count are rendered whatever the list holds, so the
          page has the same shape empty as full. */}
      <h2 className="font-semibold text-xl">{SECTION}</h2>
      <p className="mb-4 text-muted text-sm">{`${total} käyttäjää`}</p>

      {notice && (
        <p className="mb-4 text-sm" role="alert">
          {notice}
        </p>
      )}

      {users.length === 0 && <p className="text-muted">{EMPTY}</p>}

      {users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-2 pr-4">{COLUMN_EMAIL}</th>
                <th className="py-2 pr-4">{COLUMN_NAME}</th>
                <th className="py-2 pr-4">{COLUMN_ROLE}</th>
                <th className="py-2 pr-4">{COLUMN_JOINED}</th>
                <th className="py-2">{COLUMN_ACTIONS}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => {
                const self = entry.id === currentAdminId;
                const admin = isAdminRole(entry.role);
                return (
                  <tr className="border-border/50 border-b" key={entry.id}>
                    <td className="py-2 pr-4">{entry.email}</td>
                    <td className="py-2 pr-4">{entry.name}</td>
                    <td className="py-2 pr-4">{admin ? ROLE_ADMIN : ROLE_USER}</td>
                    <td className="py-2 pr-4">{joinedFormatter.format(entry.createdAt)}</td>
                    <td className="py-2">
                      {/* An admin's own row carries no controls at all: the actions would
                        refuse it anyway. */}
                      {self ? null : (
                        <span className="flex gap-2">
                          <button
                            className="underline disabled:opacity-50"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                admin ? demoteUserAction(entry.id) : promoteUserAction(entry.id)
                              )
                            }
                            type="button"
                          >
                            {admin ? DEMOTE : PROMOTE}
                          </button>
                          <button
                            className="underline disabled:opacity-50"
                            disabled={pending}
                            onClick={() => setConfirming(entry)}
                            type="button"
                          >
                            {DELETE}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Sivutus" className="mt-4 flex items-center gap-4 text-sm">
          {/* Plain links, not buttons: the page is server-rendered per request,
              so a page change is a navigation. That also makes each page
              linkable and the browser's back button work. */}
          {page > 1 ? (
            <SameRouteLink href={`?${pageParam}=${page - 1}`}>{PREVIOUS}</SameRouteLink>
          ) : (
            <span className="text-muted">{PREVIOUS}</span>
          )}
          <span className="text-muted">{`Sivu ${page} / ${pages}`}</span>
          {page < pages ? (
            <SameRouteLink href={`?${pageParam}=${page + 1}`}>{NEXT}</SameRouteLink>
          ) : (
            <span className="text-muted">{NEXT}</span>
          )}
        </nav>
      )}

      {confirming && (
        <div className="mt-4 rounded border border-border p-4" role="alertdialog">
          <p className="font-semibold">{`Poistetaanko ${confirming.email} pysyvästi?`}</p>
          <p className="mt-1 text-muted text-sm">{CONFIRM_BODY}</p>
          <span className="mt-3 flex gap-3">
            <button
              className="underline disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                run(() => deleteUserAction(target.id));
              }}
              type="button"
            >
              {DELETE}
            </button>
            <button className="underline" onClick={() => setConfirming(null)} type="button">
              {CANCEL}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
