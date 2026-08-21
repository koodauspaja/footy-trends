import type { ReactNode } from "react";

type SeasonFormProps = {
  actionPath: string;
  competitionCode: string;
  children: ReactNode;
};

/**
 * The `<form>`/hidden-`kilpailu`-field/no-JS-submit-button wrapper shared by
 * every selector control that has no visible `Kilpailu` select of its own
 * (`MatchesControls`, `TeamSeasonSelector`, `TasoStandingsControls`,
 * `TasoSeasonOnlyControls`) — a plain GET form so selections still work
 * without JavaScript. `StandingsControls` is the one exception: it shows
 * `Kilpailu` as a visible field, not a hidden one, so it doesn't use this.
 */
export function SeasonForm({ actionPath, competitionCode, children }: SeasonFormProps) {
  return (
    <form action={actionPath} method="get" className="mb-6 flex flex-wrap items-center gap-3">
      <input type="hidden" name="kilpailu" value={competitionCode} />
      {children}
      <noscript>
        <button className="rounded border border-zinc-300 px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
