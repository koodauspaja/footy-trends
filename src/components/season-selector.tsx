"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";

type SeasonSelectorProps = {
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * Plain GET form so the season can still be switched without JavaScript; the
 * `Näytä` button is only shown when scripting is unavailable, because with
 * scripting the change handler navigates immediately.
 */
export function SeasonSelector({ seasons, selectedSeasonId }: SeasonSelectorProps) {
  const router = useRouter();

  return (
    <form action="/" method="get" className="mb-6 flex items-center gap-3">
      <label className="text-sm text-zinc-600" htmlFor="kausi">
        Kausi
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        defaultValue={selectedSeasonId}
        id="kausi"
        name="kausi"
        onChange={(event) => router.push(`/?kausi=${encodeURIComponent(event.target.value)}`)}
      >
        {seasons.map((season) => (
          <option key={season.seasonId} value={season.seasonId}>
            {season.label}
          </option>
        ))}
      </select>
      <noscript>
        <button className="rounded border border-zinc-300 px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
