"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { SeasonForm } from "./season-form";
import { SeasonSelect } from "./season-select";

type TeamSeasonSelectorProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  teamProviderId: number;
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
 * Season-only selector for the team page. Targets the public
 * `/ulkomaat/joukkue/:id` URL, and carries `kilpailu` forward in a hidden
 * field.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/006-other-competitions.md
 * decisions/012-finnish-urls-english-code.md
 * decisions/022-teams-between-tiers.md
 */
export function TeamSeasonSelector({
  basePath,
  teamProviderId,
  competitionCode,
  seasons,
  selectedSeasonId,
  seasonCompetitions,
}: Readonly<TeamSeasonSelectorProps>) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", seasonCompetitions?.[seasonId] ?? competitionCode);
    params.set("kausi", String(seasonId));
    router.push(`${basePath}/joukkue/${teamProviderId}?${params.toString()}`);
  }

  return (
    <SeasonForm
      actionPath={`${basePath}/joukkue/${teamProviderId}`}
      competitionCode={competitionCode}
    >
      <SeasonSelect seasons={seasons} selectedSeasonId={selectedSeasonId} onChange={navigate} />
    </SeasonForm>
  );
}
