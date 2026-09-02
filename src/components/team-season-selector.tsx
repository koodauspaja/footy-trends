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
   * Season → the competition the club played that season, where it differs
   * from the one being shown.
   *
   * Promotion and relegation mean a club's seasons are spread across tiers, so
   * picking a season on its Veikkausliiga page should land on the Ykkösliiga
   * page it actually played — not on an empty one. Omitted on pages that are
   * not a club's, where the competition never changes.
   *
   * Navigation only: a typed URL still renders the competition it names, and
   * the plain GET fallback below keeps carrying the current one, which lands on
   * a page that explains itself. See specs/022-teams-between-tiers.md.
   */
  seasonCompetitions?: Readonly<Record<number, string>>;
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
