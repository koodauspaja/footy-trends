"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";
import { StageSelect } from "./stage-select";

type CupMatchesControlsProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableStages: string[];
  selectedStage: string | undefined;
};

/**
 * Season and stage selector for a cup's match list at `/ulkomaat/ottelut`.
 * `kierros` is dropped and `vaihe` set; the stage select renders only once a
 * stage is known.
 *
 * decisions/014-champions-league.md
 */
export function CupMatchesControls({
  basePath,
  competitionCode,
  seasons,
  selectedSeasonId,
  availableStages,
  selectedStage,
}: Readonly<CupMatchesControlsProps>) {
  const router = useRouter();

  function navigate(seasonId: number, stage: string | undefined) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    params.delete("kierros");
    if (stage === undefined) {
      params.delete("vaihe");
    } else {
      params.set("vaihe", stage);
    }
    router.push(`${basePath}/ottelut?${params.toString()}`);
  }

  return (
    <SeasonForm actionPath={`${basePath}/ottelut`} competitionCode={competitionCode}>
      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        // The stage is not carried across a season change: a cup's seasons do
        // not share a stage list, so a stage valid in one can be absent from
        // the next.
        onChange={(seasonId) => navigate(seasonId, undefined)}
      />
      {selectedStage !== undefined && availableStages.length > 0 && (
        <StageSelect
          availableStages={availableStages}
          selectedStage={selectedStage}
          onChange={(stage) => navigate(selectedSeasonId, stage)}
        />
      )}
    </SeasonForm>
  );
}
