"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { SeasonSelect } from "./season-select";

type TeamSeasonSelectorProps = {
  teamProviderId: number;
  competitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * Season-only selector for the team page. Targets the public `/joukkue/:id`
 * URL (not the `/team/:id` App Router folder — see the rewrite in
 * next.config.ts) so navigation never leaks the internal English route name.
 * Carries `kilpailu` forward via a hidden field — there's no competition
 * selector on this page (see specs/006-other-competitions.md), so it must
 * survive both the JS-driven navigation and the plain GET form fallback.
 */
export function TeamSeasonSelector({
  teamProviderId,
  competitionCode,
  seasons,
  selectedSeasonId,
}: TeamSeasonSelectorProps) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    router.push(`/joukkue/${teamProviderId}?${params.toString()}`);
  }

  return (
    <form
      action={`/joukkue/${teamProviderId}`}
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="kilpailu" value={competitionCode} />
      <SeasonSelect seasons={seasons} selectedSeasonId={selectedSeasonId} onChange={navigate} />
      <noscript>
        <button className="rounded border border-zinc-300 px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
