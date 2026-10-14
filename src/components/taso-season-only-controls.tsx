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
  /**
   * Season → the competition the club played that season, where it differs from
   * the one being shown. Navigation only; omitted on pages that are not a
   * club's.
   */
  seasonCompetitions?: Readonly<Record<number, string>>;
};

/**
 * Season-only selector shared by `/kotimaa/ottelut` and
 * `/kotimaa/joukkue/:id`: neither page has a round selector. `actionPath` is
 * the full target path, including a team id for the team page.
 *
 * decisions/009-veikkausliiga.md
 * decisions/022-teams-between-tiers.md
 */
export function TasoSeasonOnlyControls({
  actionPath,
  competitionCode,
  seasons,
  selectedSeasonId,
  seasonCompetitions,
}: Readonly<TasoSeasonOnlyControlsProps>) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", seasonCompetitions?.[seasonId] ?? competitionCode);
    params.set("kausi", String(seasonId));
    router.push(`${actionPath}?${params.toString()}`);
  }

  return (
    <SeasonForm actionPath={actionPath} competitionCode={competitionCode}>
      <SeasonSelect seasons={seasons} selectedSeasonId={selectedSeasonId} onChange={navigate} />
    </SeasonForm>
  );
}
