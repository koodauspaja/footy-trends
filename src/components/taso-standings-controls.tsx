"use client";

import type { SeasonOption } from "@/lib/seasons";
import { RoundSelect } from "./round-select";
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
 * decisions/015-finnish-cups.md
 * decisions/532-one-transaction-type-one-round-dropdown.md
 */
export function TasoStandingsControls({
  competitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: Readonly<TasoStandingsControlsProps>) {
  const navigate = useSeasonRoundNavigation("/kotimaa/sarjataulukko");

  return (
    <SeasonForm actionPath="/kotimaa/sarjataulukko" competitionCode={competitionCode}>
      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(competitionCode, seasonId, selectedRound)}
      />

      {/* No round-aware group, as in a cup, leaves nothing to filter. */}
      {availableRounds.length > 0 && (
        <RoundSelect
          availableRounds={availableRounds}
          selectedRound={selectedRound}
          onChange={(round) => navigate(competitionCode, selectedSeasonId, round)}
          wholeSeason
        />
      )}
    </SeasonForm>
  );
}
