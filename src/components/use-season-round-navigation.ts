"use client";

import { useRouter } from "next/navigation";

/**
 * The season and round navigation shared by `MatchesControls` and
 * `TasoStandingsControls`: copy the current query string forward, overwrite
 * `kilpailu` and `kausi`, and set or clear `kierros`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/012-finnish-urls-english-code.md
 */
export function useSeasonRoundNavigation(actionPath: string, competitionCode: string) {
  const router = useRouter();

  return function navigate(seasonId: number, round: number | undefined) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    if (round === undefined) {
      params.delete("kierros");
    } else {
      params.set("kierros", String(round));
    }
    router.push(`${actionPath}?${params.toString()}`);
  };
}
