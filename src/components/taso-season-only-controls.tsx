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
