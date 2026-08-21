"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { RoundSelect } from "./round-select";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";

type MatchesControlsProps = {
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * Season + round selector for the season-wide match list at `/ottelut`.
 * Plain GET form so both selections still work without JavaScript, same
 * pattern as `StandingsControls` on the standings page. The round select is
 * only rendered once a round is actually known — see the "known
 * limitation" note in specs/005-listing-matches-for-selected-season.md for
 * why that can briefly be absent right after a season's first sync.
 * Carries `kilpailu` forward via a hidden field — there's no competition
 * selector on this page (see specs/006-other-competitions.md).
 */
export function MatchesControls({
  competitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: MatchesControlsProps) {
  const router = useRouter();

  function navigate(seasonId: number, round: number | undefined) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    if (round === undefined) {
      params.delete("kierros");
    } else {
      params.set("kierros", String(round));
    }
    router.push(`/ottelut?${params.toString()}`);
  }

  return (
    <SeasonForm actionPath="/ottelut" competitionCode={competitionCode}>
      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(seasonId, selectedRound)}
      />
      {selectedRound !== undefined && availableRounds.length > 0 && (
        <RoundSelect
          availableRounds={availableRounds}
          selectedRound={selectedRound}
          onChange={(round) => navigate(selectedSeasonId, round)}
        />
      )}
    </SeasonForm>
  );
}
