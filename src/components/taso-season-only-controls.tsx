"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";

type TasoSeasonOnlyControlsProps = {
  actionPath: string;
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * Season-only selector shared by `/kotimaa/ottelut` and
 * `/kotimaa/joukkue/:id` — no round selector on either page (the season's
 * full match list is shown at once; see specs/009-veikkausliiga.md's
 * acceptance criteria, which describe both as listing "a season's
 * matches"/"a team's matches for a season", not a round-paginated view).
 * `actionPath` is the full target path, including a team id for the team
 * page — same reasoning as `TeamSeasonSelector`.
 */
export function TasoSeasonOnlyControls({
  actionPath,
  competitionCode,
  seasons,
  selectedSeasonId,
}: Readonly<TasoSeasonOnlyControlsProps>) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    router.push(`${actionPath}?${params.toString()}`);
  }

  return (
    <SeasonForm actionPath={actionPath} competitionCode={competitionCode}>
      <SeasonSelect seasons={seasons} selectedSeasonId={selectedSeasonId} onChange={navigate} />
    </SeasonForm>
  );
}
