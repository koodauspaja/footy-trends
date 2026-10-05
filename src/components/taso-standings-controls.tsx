"use client";

import type { SeasonOption } from "@/lib/seasons";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";
import { useSeasonRoundNavigation } from "./use-season-round-navigation";

type TasoStandingsControlsProps = {
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * Season and round selectors for a Finnish competition's table. The competition
 * is picked on `/kotimaa`, so it rides along as a hidden field; the round is one
 * value for every group on the page.
 *
 * decisions/009-veikkausliiga.md
 * decisions/531-comments-say-what-code-is-for.md
 */
export function TasoStandingsControls({
  competitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: Readonly<TasoStandingsControlsProps>) {
  const navigate = useSeasonRoundNavigation("/kotimaa/sarjataulukko", competitionCode);

  return (
    <SeasonForm actionPath="/kotimaa/sarjataulukko" competitionCode={competitionCode}>
      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(seasonId, selectedRound)}
      />

      {/* No round-aware group, as in a cup, leaves nothing to filter. */}
      {availableRounds.length > 0 && (
        <>
          <label className="text-sm text-muted" htmlFor="kierros">
            Kierros
          </label>
          <select
            className="rounded border border-border px-3 py-2"
            defaultValue={selectedRound ?? ""}
            id="kierros"
            name="kierros"
            onChange={(event) => {
              const { value } = event.target;
              navigate(selectedSeasonId, value === "" ? undefined : Number(value));
            }}
          >
            <option value="">Koko kausi</option>
            {availableRounds.map((round) => (
              <option key={round} value={round}>
                {`Kierros ${round}`}
              </option>
            ))}
          </select>
        </>
      )}
    </SeasonForm>
  );
}
