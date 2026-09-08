"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import { useSession } from "@/lib/auth-client";
import type { CompetitionOption } from "@/lib/competition-preferences";
import { type Preferences, REGION_SEGMENTS, type RegionSegment } from "@/lib/regions";
import {
  type ActionResult,
  deleteAccount,
  saveSettings,
  signOutOtherDevices,
} from "@/lib/settings-actions";

export type Device = {
  id: string;
  description: string;
  lastUsed: string;
  current: boolean;
};

/**
 * The per-region option lists and their `Oletus (…)` labels are built on the
 * server and passed in. This component may not import a competition registry:
 * `domestic-competitions.ts` reaches ioredis, which cannot be bundled for the
 * browser. See src/lib/competition-preferences.ts.
 */
export type RegionOptions = {
  region: RegionSegment;
  label: string;
  fallbackLabel: string;
  options: CompetitionOption[];
};

type Props = Readonly<{
  preferences: Preferences;
  /** `null` when the list could not be read — distinct from an empty list. */
  devices: Device[] | null;
  regionOptions: RegionOptions[];
}>;

const REGION_LABELS: Record<RegionSegment, string> = {
  kotimaa: "Kotimaa",
  ulkomaat: "Ulkomaat",
  maajoukkueet: "Maajoukkueet",
};

const FIELD_NAME: Record<RegionSegment, keyof Preferences> = {
  kotimaa: "defaultCompetitionDomestic",
  ulkomaat: "defaultCompetitionForeign",
  maajoukkueet: "defaultCompetitionNational",
};

const SELECT_CLASS = "rounded border border-border px-2 py-1 text-sm";
const SECTION_CLASS = "mb-8";
const HEADING_CLASS = "mb-3 font-medium text-lg";

export function SettingsPage({ preferences, devices, regionOptions }: Props) {
  const [saved, setSaved] = useState<null | "ok" | "error" | "stale">(null);
  const [pending, startTransition] = useTransition();
  const { refetch } = useSession();

  return (
    <>
      <form
        action={(formData) => {
          startTransition(async () => {
            /**
             * The actions return `{ ok: false }` for their own failures, but
             * the *invocation* can reject on its own — a dropped connection or
             * a server-action transport error never reaches their `try`. Each
             * call site below catches that too, otherwise the reader gets a
             * dead control and an unhandled rejection.
             */
            let result: ActionResult;
            try {
              result = await saveSettings(formData);
            } catch {
              setSaved("error");
              return;
            }
            setSaved(result.ok ? "ok" : "error");

            /**
             * The start region rides on the session payload (see the
             * `customSession` plugin in src/lib/auth.ts), and the mounted
             * `useSession()` store does not know it just changed. Without this
             * refetch the header's `Etusivu` link and the front page keep
             * acting on the previous value until a full reload — so a reader
             * who saves `Kotimaa` and clicks through would see the setting do
             * nothing.
             *
             * A rejected refetch must not escape the transition, and must not
             * be reported as a successful save either: the save *did* succeed,
             * but the setting will not take effect until the page is reloaded,
             * and saying so is more use than a silent stale header.
             */
            if (!result.ok) return;
            try {
              await refetch();
            } catch {
              setSaved("stale");
            }
          });
        }}
        className={SECTION_CLASS}
      >
        <h2 className={HEADING_CLASS}>Aloitusnäkymä</h2>
        <label className="mb-1 block text-sm" htmlFor="defaultRegion">
          Mistä sovellus aloittaa
        </label>
        {/*
          `key` is what makes an uncontrolled select follow the *stored* value.
          `defaultValue` applies on mount and is ignored on every later render,
          so after a save the server would send the new preferences back and the
          dropdown would keep showing the old one (#271).

          Keyed on the stored value rather than on the props object, which is
          deliberate: a re-render that does not change what is stored leaves a
          half-made choice alone, so picking a competition and then re-rendering
          for any other reason does not silently undo it.
        */}
        <select
          className={SELECT_CLASS}
          defaultValue={preferences.defaultRegion ?? ""}
          id="defaultRegion"
          key={preferences.defaultRegion ?? ""}
          name="defaultRegion"
        >
          {/* The unset value is a real option, not a placeholder: no setting
              here is a one-way door. */}
          <option value="">Kysy joka kerta</option>
          {REGION_SEGMENTS.map((region) => (
            <option key={region} value={region}>
              {REGION_LABELS[region]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">
          Valitsemasi alue avataan suoraan, kun siirryt etusivulle. Pääset silti aina alueen
          valintaan.
        </p>

        <h2 className={`${HEADING_CLASS} mt-6`}>Oletussarjat</h2>
        <div className="flex flex-col gap-3">
          {regionOptions.map((field) => {
            const name = FIELD_NAME[field.region];
            return (
              <div key={field.region}>
                <label className="mb-1 block text-sm" htmlFor={name}>
                  {field.label}
                </label>
                {/* Keyed on the stored value — see the note above. */}
                <select
                  className={SELECT_CLASS}
                  defaultValue={preferences[name] ?? ""}
                  id={name}
                  key={preferences[name] ?? ""}
                  name={name}
                >
                  {/* A real value, not a placeholder: unsetting must be possible. */}
                  <option value="">{field.fallbackLabel}</option>
                  {field.options.map((competition) => (
                    <option key={competition.code} value={competition.code}>
                      {competition.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <button
          className="mt-4 rounded border border-border px-3 py-2 text-sm hover:bg-surface"
          disabled={pending}
          type="submit"
        >
          Tallenna
        </button>
        {saved === "ok" && <Notice>Asetukset tallennettu.</Notice>}
        {saved === "stale" && (
          <Notice>Asetukset tallennettu. Päivitä sivu, jotta muutokset tulevat voimaan.</Notice>
        )}
        {saved === "error" && (
          <Notice>Asetusten tallentaminen epäonnistui. Yritä uudelleen.</Notice>
        )}
      </form>

      <DeviceList devices={devices} />
      <DeleteAccount />
    </>
  );
}

function DeviceList({ devices }: Readonly<{ devices: Device[] | null }>) {
  const [result, setResult] = useState<null | "ok" | "error">(null);
  const [pending, startTransition] = useTransition();
  // Unknown, not empty. "Only this device" is a claim about the reader's
  // account security, and we cannot make it from a failed request.
  const unknown = devices === null;
  const others = devices?.filter((device) => !device.current) ?? [];

  return (
    <section className={SECTION_CLASS}>
      <h2 className={HEADING_CLASS}>Kirjautuneet laitteet</h2>
      {unknown && <Notice>Laitelistaa ei voitu ladata.</Notice>}
      <ul className="mb-3 flex flex-col gap-2">
        {(devices ?? []).map((device) => (
          <li className="text-sm" key={device.id}>
            <span>{device.description}</span>
            {device.current && <span className="ml-2 text-muted">Tämä laite</span>}
            <span className="ml-2 text-muted">{device.lastUsed}</span>
          </li>
        ))}
      </ul>
      {!unknown && others.length === 0 ? (
        <p className="text-sm text-muted">Olet kirjautunut sisään vain tällä laitteella.</p>
      ) : (
        <button
          className="rounded border border-border px-3 py-2 text-sm hover:bg-surface"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              try {
                const outcome = await signOutOtherDevices();
                setResult(outcome.ok ? "ok" : "error");
              } catch {
                setResult("error");
              }
            });
          }}
          type="button"
        >
          Kirjaa ulos muut laitteet
        </button>
      )}
      {result === "ok" && <Notice>Muut laitteet kirjattu ulos.</Notice>}
      {result === "error" && <Notice>Uloskirjaus epäonnistui. Yritä uudelleen.</Notice>}
    </section>
  );
}

const CONFIRMATION = "POISTA";

function DeleteAccount() {
  const [confirmation, setConfirmation] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  // Trimmed, then compared case-sensitively: ` POISTA ` works, `poista` does
  // not. The friction is the point — there is no undo.
  const armed = confirmation.trim() === CONFIRMATION;

  return (
    <section className={SECTION_CLASS}>
      <h2 className={HEADING_CLASS}>Tilin poistaminen</h2>
      <p className="mb-3 text-sm">
        Tilin poistaminen on lopullista. Tilisi, istuntosi ja Google-yhteytesi poistetaan, eikä
        niitä voi palauttaa.
      </p>
      <label className="mb-1 block text-sm" htmlFor="confirmation">
        Vahvistus
      </label>
      <input
        className="mb-3 block rounded border border-border px-2 py-1 text-sm"
        id="confirmation"
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder={CONFIRMATION}
        type="text"
        value={confirmation}
      />
      <p className="mb-3 text-sm text-muted">Kirjoita {CONFIRMATION} vahvistaaksesi.</p>
      <button
        className="rounded border border-border px-3 py-2 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!armed || pending}
        onClick={() => {
          startTransition(async () => {
            try {
              const outcome = await deleteAccount(confirmation);
              // On success the account is gone, so there is nobody left to show
              // a farewell screen to. A full load clears every trace of the
              // session.
              if (outcome.ok) window.location.href = "/";
              else setFailed(true);
            } catch {
              setFailed(true);
            }
          });
        }}
        type="button"
      >
        Poista tili
      </button>
      {failed && <Notice>Tilin poistaminen epäonnistui. Yritä uudelleen.</Notice>}
    </section>
  );
}
