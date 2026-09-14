"use client";

import {
  isEmptyCounts,
  previewHasChanges,
  REMOVED_MATCHES_SHOWN,
  type RefreshPreview,
  type RowCounts,
} from "@/lib/refresh-view";

/**
 * "This is how the data would change — do you still want to?", from
 * specs/029-forced-season-refresh.md.
 *
 * **This dialog is the control, not a courtesy.** A truncated provider answer
 * is indistinguishable from a season that genuinely lost fixtures — nothing in
 * the response separates them, so nothing in the code can. What separates them
 * is a person seeing `Poistuvia otteluita: 180` and declining.
 *
 * Which is why removals are **listed by name** rather than counted. A number is
 * not enough to judge a deletion by, and deletion is the only irreversible
 * thing this tool does.
 */

const HEADING = "Näin tiedot muuttuisivat";
const QUESTION = "Haluatko päivittää?";
const CONFIRM = "Päivitä";
const CANCEL = "Peruuta";
const CLOSE = "Sulje";
const APPLYING = "Päivitetään…";
const NO_CHANGES = "Tiedot ovat jo ajan tasalla. Mitään ei muuttuisi.";
const DEDUCTIONS = "Muuttuvat pistevähennykset:";
const REMOVED = "Poistuvat ottelut:";

const MATCH_LABELS = {
  inserted: "Uusia otteluita",
  updated: "Muuttuvia otteluita",
  deleted: "Poistuvia otteluita",
} as const;

const GROUP_LABELS = {
  inserted: "Uusia sarjataulukkorivejä",
  updated: "Muuttuvia sarjataulukkorivejä",
  deleted: "Poistuvia sarjataulukkorivejä",
} as const;

const kickoffFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** A line per non-zero count. A zero is not news and would bury what is. */
function CountLines({
  counts,
  labels,
}: Readonly<{ counts: RowCounts | null; labels: Record<keyof RowCounts, string> }>) {
  if (counts === null || isEmptyCounts(counts)) return null;

  return (
    <>
      {(Object.keys(labels) as (keyof RowCounts)[])
        .filter((key) => counts[key] > 0)
        .map((key) => (
          <li key={key}>{`${labels[key]}: ${counts[key]}`}</li>
        ))}
    </>
  );
}

type Props = Readonly<{
  preview: RefreshPreview;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>;

export function RefreshConfirm({ preview, pending, onConfirm, onCancel }: Props) {
  const changes = previewHasChanges(preview);
  const shown = preview.removedMatches.slice(0, REMOVED_MATCHES_SHOWN);
  const hidden = preview.removedMatches.length - shown.length;

  return (
    // A real `<dialog>` rather than `role="dialog"`: the element carries the
    // semantics natively and behaves consistently across assistive technology,
    // which the role alone does not guarantee.
    //
    // `open` rather than `showModal()`, because this is rendered inline under
    // the form rather than over the page — the admin can still see the choices
    // that produced it — and a top-layer modal would need focus management this
    // does not otherwise require.
    <dialog
      aria-labelledby="refresh-confirm-heading"
      className="mt-6 block w-full rounded border p-4"
      open
    >
      <h2 className="font-semibold text-lg" id="refresh-confirm-heading">
        {HEADING}
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {`${preview.competitionName} ${preview.seasonLabel}`}
      </p>

      {changes ? (
        <ul className="mt-3 list-disc pl-5 text-sm">
          <CountLines counts={preview.matches} labels={MATCH_LABELS} />
          <CountLines counts={preview.groupRows} labels={GROUP_LABELS} />
        </ul>
      ) : (
        <p className="mt-3 text-sm">{NO_CHANGES}</p>
      )}

      {preview.deductionChanges.length > 0 && (
        <div className="mt-4">
          <p className="font-medium text-sm">{DEDUCTIONS}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {preview.deductionChanges.map((change) => (
              <li key={`${change.teamName}-${change.from}-${change.to}`}>
                {`${change.teamName}: ${change.from ?? "–"} → ${change.to ?? "–"}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length > 0 && (
        <div className="mt-4">
          <p className="font-medium text-sm">{REMOVED}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {shown.map((match) => (
              <li key={match.providerMatchId}>
                {`${kickoffFormatter.format(new Date(match.kickoffAt))} ${match.homeTeamName}–${match.awayTeamName}`}
              </li>
            ))}
          </ul>
          {hidden > 0 && <p className="mt-1 text-sm">{`…ja ${hidden} muuta.`}</p>}
        </div>
      )}

      {changes ? (
        <>
          <p className="mt-4 font-medium text-sm">{QUESTION}</p>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded border px-3 py-1 text-sm"
              disabled={pending}
              onClick={onConfirm}
              type="button"
            >
              {pending ? APPLYING : CONFIRM}
            </button>
            <button
              className="rounded border px-3 py-1 text-sm"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              {CANCEL}
            </button>
          </div>
        </>
      ) : (
        // No `Päivitä` at all when nothing would change: offering it would
        // invite a write that has nothing to write.
        <div className="mt-4">
          <button className="rounded border px-3 py-1 text-sm" onClick={onCancel} type="button">
            {CLOSE}
          </button>
        </div>
      )}
    </dialog>
  );
}
