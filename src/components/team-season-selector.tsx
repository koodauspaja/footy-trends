"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";
import { SeasonSelect } from "./season-select";

type TeamSeasonSelectorProps = {
  teamProviderId: number;
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * Season-only selector for the team page. Targets the public `/joukkue/:id`
 * URL (not the `/team/:id` App Router folder — see the rewrite in
 * next.config.ts) so navigation never leaks the internal English route name.
 */
export function TeamSeasonSelector({
  teamProviderId,
  seasons,
  selectedSeasonId,
}: TeamSeasonSelectorProps) {
  const router = useRouter();

  function navigate(seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kausi", String(seasonId));
    router.push(`/joukkue/${teamProviderId}?${params.toString()}`);
  }

  return (
    <form
      action={`/joukkue/${teamProviderId}`}
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
      <SeasonSelect seasons={seasons} selectedSeasonId={selectedSeasonId} onChange={navigate} />
      <noscript>
        <button className="rounded border border-zinc-300 px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
