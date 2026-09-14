"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { RefreshConfirm } from "@/components/refresh-confirm";
import {
  applyRefreshAction,
  previewRefreshAction,
  seasonsForCompetitionAction,
} from "@/lib/refresh-actions";
import type {
  CompetitionOption,
  RefreshFailureReason,
  RefreshPreview,
  SeasonChoice,
} from "@/lib/refresh-view";

/**
 * The forced season refresh, from specs/029-forced-season-refresh.md.
 *
 * A client component because every control is interactive and the apply asks
 * first. It imports `refresh-view.ts` rather than the engine: that reaches the
 * database and this is a browser bundle — the boundary `admin-user-view.ts` and
 * `favourite-keys.ts` exist for.
 */

const COMPETITION_LABEL = "Sarja";
const SEASON_LABEL = "Kausi";
const DOMESTIC_GROUP = "Kotimaa";
const FOREIGN_GROUP = "Ulkomaat";
const SUBMIT = "Hae muutokset";
const LOADING_PREVIEW = "Haetaan…";
const LOADING_SEASONS = "Ladataan…";
const SEASONS_FAILED = "Kausien haku epäonnistui.";
const NO_SEASONS = "Tälle sarjalle ei ole tallennettuja kausia.";
/** A rejected request, as opposed to one that answered with a refusal. */
const REQUEST_FAILED = "Pyyntö epäonnistui. Yritä uudelleen.";

/** Every refusal either action can report, in Finnish. */
const REFUSALS: Record<RefreshFailureReason, string> = {
  input: "Tuntematon sarja tai kausi.",
  cache:
    "Välimuistia ei voitu tyhjentää, joten haku olisi palauttanut vanhaa tietoa. Mitään ei haettu.",
  provider: "Haku epäonnistui. Palvelu ei vastannut. Tallennetut tiedot jäivät ennalleen.",
  empty:
    "Palvelu ei palauttanut tälle kaudelle mitään, vaikka tallennettuja rivejä on. Mitään ei muutettu.",
  read: "Tallennettujen tietojen luku epäonnistui. Mitään ei muutettu.",
  stale: "Tiedot muuttuivat haun jälkeen. Tarkista muutokset uudelleen.",
  write: "Tallennus epäonnistui. Tallennetut tiedot jäivät ennalleen.",
};

function appliedNotice(preview: RefreshPreview): string {
  const { matches, groupRows } = preview;
  const lines = [
    `${preview.competitionName} ${preview.seasonLabel} päivitetty.`,
    `Otteluita: ${matches.inserted} uutta, ${matches.updated} muuttunutta, ${matches.deleted} poistettua.`,
  ];
  if (groupRows !== null) {
    lines.push(
      `Sarjataulukkorivejä: ${groupRows.inserted} uutta, ${groupRows.updated} muuttunutta, ${groupRows.deleted} poistettua.`
    );
  }
  return lines.join(" ");
}

type Props = Readonly<{
  domestic: CompetitionOption[];
  foreign: CompetitionOption[];
}>;

export function RefreshForm({ domestic, foreign }: Props) {
  const competitionId = useId();
  const seasonId = useId();

  const [competition, setCompetition] = useState(domestic[0]?.value ?? "");
  const [seasons, setSeasons] = useState<SeasonChoice[] | null>(null);
  const [seasonsFailed, setSeasonsFailed] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [preview, setPreview] = useState<RefreshPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Which request is the current one.
   *
   * Bumped when a request starts **and** when the selection changes, so an
   * answer for a competition or season nobody is looking at any more is
   * dropped rather than shown. Without it a slow preview could put one
   * competition's diff on screen while the buttons beneath it act on another —
   * and the whole feature rests on the diff an admin sees being the one they
   * approve.
   */
  const requestId = useRef(0);

  /**
   * Invalidates whatever is in flight. Call on every change of selection.
   *
   * `useCallback` with no dependencies so the identity is stable: the effect
   * below lists it, and a function rebuilt each render would restart that
   * effect every render — refetching the season list continuously.
   */
  const abandonInFlight = useCallback(() => {
    requestId.current += 1;
  }, []);

  /**
   * Loaded for the chosen competition only. There are ten foreign competitions
   * and each needs its own provider call, so resolving them all on mount would
   * turn a cold cache into ten requests against a rate-limited plan.
   */
  useEffect(() => {
    if (competition === "") return;

    let current = true;
    abandonInFlight();
    setSeasons(null);
    setSeasonsFailed(false);
    setSeason(null);
    setPreview(null);

    seasonsForCompetitionAction(competition)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setSeasonsFailed(true);
          return;
        }
        setSeasons(result.seasons);
        // The newest season the app holds, which is the one most likely wanted.
        setSeason(result.seasons[0]?.seasonId ?? null);
      })
      .catch(() => {
        if (current) setSeasonsFailed(true);
      });

    // Guards against an older competition's seasons arriving after a newer
    // choice's and overwriting them.
    return () => {
      current = false;
    };
  }, [competition, abandonInFlight]);

  /**
   * Runs one action, ignoring its answer if the selection moved on, and
   * turning a rejection into something an admin can read.
   *
   * A server action can reject rather than return a refusal — a dropped
   * connection, an exception the engine did not convert — and `void action()`
   * on its own would swallow that, leaving the form pending with no notice and
   * no way forward.
   */
  const run = <T,>(request: () => Promise<T>, settle: (value: T) => void) => {
    abandonInFlight();
    const id = requestId.current;
    setNotice(null);

    startTransition(() => {
      void request()
        .then((value) => {
          if (id === requestId.current) settle(value);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setPreview(null);
          setNotice(REQUEST_FAILED);
        });
    });
  };

  const onPreview = (chosenSeason: number) => {
    run(
      () => previewRefreshAction(competition, chosenSeason),
      (result) => {
        if (result.ok) {
          setPreview(result.preview);
          return;
        }
        setPreview(null);
        setNotice(REFUSALS[result.reason]);
      }
    );
  };

  const onApply = (chosenSeason: number, approved: RefreshPreview) => {
    run(
      () => applyRefreshAction(competition, chosenSeason, approved.snapshotHash),
      (result) => {
        if (result.ok) {
          setPreview(null);
          setNotice(appliedNotice(result.applied));
          return;
        }
        // A stale refusal carries the fresh diff, so the admin decides again on
        // what is actually there rather than being told to start over.
        setPreview(result.preview ?? null);
        setNotice(REFUSALS[result.reason]);
      }
    );
  };

  /**
   * The season, once there is one to act on. Narrowed here rather than guarded
   * inside each handler: a guard the disabled button makes unreachable is a
   * branch no test can reach and no reader can justify.
   */
  const chosenSeason = seasons === null ? null : season;

  return (
    <section>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="font-medium text-sm" htmlFor={competitionId}>
            {COMPETITION_LABEL}
          </label>
          <select
            className="rounded border px-2 py-1 text-sm"
            id={competitionId}
            onChange={(event) => setCompetition(event.target.value)}
            value={competition}
          >
            <optgroup label={DOMESTIC_GROUP}>
              {domestic.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={FOREIGN_GROUP}>
              {foreign.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-sm" htmlFor={seasonId}>
            {SEASON_LABEL}
          </label>
          <select
            className="rounded border px-2 py-1 text-sm"
            disabled={chosenSeason === null}
            id={seasonId}
            onChange={(event) => {
              // A preview for the previous season must not land on this one.
              abandonInFlight();
              setPreview(null);
              setSeason(Number(event.target.value));
            }}
            value={season ?? ""}
          >
            {seasons === null ? (
              <option value="">{seasonsFailed ? SEASONS_FAILED : LOADING_SEASONS}</option>
            ) : (
              seasons.map((option) => (
                <option key={option.seasonId} value={option.seasonId}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </div>

        <button
          className="rounded border px-3 py-1 text-sm"
          disabled={chosenSeason === null || pending}
          onClick={chosenSeason === null ? undefined : () => onPreview(chosenSeason)}
          type="button"
        >
          {pending && preview === null ? LOADING_PREVIEW : SUBMIT}
        </button>
      </div>

      {seasons !== null && seasons.length === 0 && <p className="mt-3 text-sm">{NO_SEASONS}</p>}
      {seasonsFailed && <p className="mt-3 text-sm">{SEASONS_FAILED}</p>}

      {notice !== null && (
        <p className="mt-4 text-sm" role="alert">
          {notice}
        </p>
      )}

      {preview !== null && chosenSeason !== null && (
        <RefreshConfirm
          onCancel={() => setPreview(null)}
          onConfirm={() => onApply(chosenSeason, preview)}
          pending={pending}
          preview={preview}
        />
      )}
    </section>
  );
}
