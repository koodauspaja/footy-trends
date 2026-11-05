"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import { type SaveNicknameResult, saveNicknameAction } from "@/lib/nickname-actions";
import { reportClientError } from "@/lib/report-client-error";

/**
 * The settings page's `Nimimerkki` section: the user's own nickname, set,
 * changed, or removed by saving the field empty.
 *
 * decisions/077-nickname.md
 */

type Refusal = Extract<SaveNicknameResult, { ok: false }>["reason"];

/**
 * The Finnish for each way a save can be refused. A listed word is not named.
 *
 * decisions/077-nickname.md
 */
const REFUSALS: Readonly<Record<Refusal, string>> = {
  length: "Nimimerkin pituus on 3–20 merkkiä.",
  characters: "Nimimerkissä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _ ja .",
  taken: "Nimimerkki on jo käytössä.",
  "word-list": "Valitse toinen nimimerkki.",
  failed: "Nimimerkin tallentaminen epäonnistui. Yritä uudelleen.",
};

const ERROR_ID = "nickname-error";

type Props = Readonly<{
  /** The stored nickname, or `null` when it could not be read: not the same as none. */
  stored: { nickname: string | null } | null;
  sectionClassName: string;
  headingClassName: string;
  buttonClassName: string;
}>;

export function NicknameSettings({
  stored,
  sectionClassName,
  headingClassName,
  buttonClassName,
}: Props) {
  const [value, setValue] = useState(stored?.nickname ?? "");
  const [saved, setSaved] = useState<null | "saved" | "removed">(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, startTransition] = useTransition();

  function announce(outcome: null | "saved" | "removed", failure: Refusal | null) {
    setSaved(outcome);
    setRefusal(failure);
  }

  return (
    <section className={sectionClassName}>
      <h2 className={headingClassName}>Nimimerkki</h2>
      <p className="mb-3 text-sm">
        Nimimerkki näkyy muille kirjautuneille käyttäjille arvauspelin tulostaulukossa.
      </p>
      {stored === null ? (
        <Notice>Nimimerkkiä ei voitu ladata.</Notice>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              try {
                const result = await saveNicknameAction(value);
                if (result.ok) {
                  // The stored form: trimmed, its spaces collapsed.
                  setValue(result.nickname ?? "");
                  announce(result.nickname === null ? "removed" : "saved", null);
                } else {
                  announce(null, result.reason);
                }
              } catch (error) {
                reportClientError(error, "nickname.save");
                announce(null, "failed");
              }
            });
          }}
        >
          <label className="mb-1 block text-sm" htmlFor="nickname">
            Nimimerkki
          </label>
          <input
            aria-describedby={refusal === null ? undefined : ERROR_ID}
            aria-invalid={refusal !== null && refusal !== "failed"}
            className="mb-3 block rounded border border-border px-2 py-1 text-sm"
            id="nickname"
            onChange={(event) => {
              setValue(event.target.value);
              announce(null, null);
            }}
            // A save's reply rewrites the field, so nothing is typed while one is out.
            readOnly={pending}
            type="text"
            value={value}
          />
          <button className={buttonClassName} disabled={pending} type="submit">
            Tallenna nimimerkki
          </button>
          {refusal !== null && (
            <p className="mt-2 text-sm" id={ERROR_ID} role="alert">
              {REFUSALS[refusal]}
            </p>
          )}
          {saved === "saved" && <Notice>Nimimerkki tallennettu.</Notice>}
          {saved === "removed" && <Notice>Nimimerkki poistettu.</Notice>}
        </form>
      )}
    </section>
  );
}
