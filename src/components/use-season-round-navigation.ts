"use client";

import { useRouter } from "next/navigation";

/**
 * The season+round navigation shared by `MatchesControls` (`/ulkomaat/ottelut`) and
 * `TasoStandingsControls` (`/kotimaa/sarjataulukko`): copy the current query
 * string forward, overwrite `kilpailu`/`kausi`, and set or clear `kierros`.
 * Reading `window.location.search` (rather than rebuilding from props) is
 * what preserves any query param neither control owns.
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
