"use client";

import type { Competition } from "@/lib/competitions";
import type { SeasonOption } from "@/lib/seasons";
import { CompetitionSelect } from "./competition-select";
import { RoundSelect } from "./round-select";
import { SeasonSelect } from "./season-select";
import { useSeasonRoundNavigation } from "./use-season-round-navigation";

type StandingsControlsProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  competitions: Competition[];
  selectedCompetitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * `Kilpailu`, `Kausi` and `Kierros` in one plain GET form, so changing one
 * resubmits all three. The `Näytä` button shows only when scripting is
 * unavailable.
 *
 * decisions/003-standings-after-selected-round.md
 * decisions/006-other-competitions.md
 * decisions/532-one-transaction-type-one-round-dropdown.md
 */
export function StandingsControls({
  basePath,
  competitions,
  selectedCompetitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: Readonly<StandingsControlsProps>) {
  const navigate = useSeasonRoundNavigation(`${basePath}/sarjataulukko`);

  return (
    <form
      action={`${basePath}/sarjataulukko`}
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode={selectedCompetitionCode}
        onChange={(code) => navigate(code, selectedSeasonId, selectedRound)}
      />

      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(selectedCompetitionCode, seasonId, selectedRound)}
      />

      <RoundSelect
        availableRounds={availableRounds}
        selectedRound={selectedRound}
        onChange={(round) => navigate(selectedCompetitionCode, selectedSeasonId, round)}
        wholeSeason
      />

      <noscript>
        <button className="rounded border border-border px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
