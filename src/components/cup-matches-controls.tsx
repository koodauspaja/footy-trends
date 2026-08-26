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
 * Season + stage selector for a cup's match list at `/ulkomaat/ottelut` — the
 * cup counterpart to `MatchesControls`, which selects a round instead.
 *
 * `kierros` is dropped and `vaihe` set, so switching between a league and a
 * cup cannot leave a stale round in the query string. Like `MatchesControls`,
 * the stage select only renders once a stage is actually known.
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
        // The stage is deliberately not carried across a season change: the
        // seasons of a cup do not share a stage list (2023/24 had a group
        // stage, 2024/25 a league phase), so a stage valid in one can be
        // absent from the next.
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
