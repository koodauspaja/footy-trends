"use client";

import type { SeasonOption } from "@/lib/seasons";
import { RoundSelect } from "./round-select";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";
import { useSeasonRoundNavigation } from "./use-season-round-navigation";

type MatchesControlsProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * Season and round selector for the season-wide match list at
 * `/ulkomaat/ottelut`: a plain GET form, with `kilpailu` carried in a hidden
 * field. The round select renders only once a round is known.
 *
 * decisions/005-listing-matches-for-selected-season.md
 * decisions/006-other-competitions.md
 * decisions/012-finnish-urls-english-code.md
 */
export function MatchesControls({
  basePath,
  competitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: Readonly<MatchesControlsProps>) {
  const navigate = useSeasonRoundNavigation(`${basePath}/ottelut`);

  return (
    <SeasonForm actionPath={`${basePath}/ottelut`} competitionCode={competitionCode}>
      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(competitionCode, seasonId, selectedRound)}
      />
      {selectedRound !== undefined && availableRounds.length > 0 && (
        <RoundSelect
          availableRounds={availableRounds}
          selectedRound={selectedRound}
          onChange={(round) => navigate(competitionCode, selectedSeasonId, round)}
        />
      )}
    </SeasonForm>
  );
}
