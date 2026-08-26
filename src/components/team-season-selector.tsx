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
};

/**
 * Season-only selector for the team page. Targets the public `/ulkomaat/joukkue/:id`
 * URL (not the `/foreign/team/:id` App Router folder — see the rewrite in
 * next.config.ts) so navigation never leaks the internal English route name.
 * Carries `kilpailu` forward via a hidden field — there's no competition
 * selector on this page (see specs/006-other-competitions.md), so it must
 * survive both the JS-driven navigation and the plain GET form fallback.
 */
export function TeamSeasonSelector({
  basePath,
  teamProviderId,
  competitionCode,
  seasons,
  selectedSeasonId,
}: Readonly<TeamSeasonSelectorProps>) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
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
