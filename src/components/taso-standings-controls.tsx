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
 * Season + round selector for `/kotimaa/sarjataulukko` — no `Kilpailu`
 * select (only one Finnish competition exists today; `kilpailu` still
 * survives navigation via a hidden field, same reasoning as
 * `MatchesControls`/`TeamSeasonSelector`). The round is page-wide, one
 * shared value across every own-calculated group's table — see
 * `listSelectableTasoRounds` in taso-standings-service.ts.
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

      <label className="text-sm text-zinc-600" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
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
    </SeasonForm>
  );
}
