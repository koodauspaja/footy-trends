"use client";

import { useRouter } from "next/navigation";
import type { SeasonOption } from "@/lib/seasons";

type SeasonRoundSelectorProps = {
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * Plain GET form so both selections still work without JavaScript; the
 * `Näytä` button is only shown when scripting is unavailable, because with
 * scripting each change handler navigates immediately. Season and round live
 * in one form so changing either resubmits both `kausi` and `kierros`
 * together — neither selection is lost when the other changes.
 */
export function SeasonRoundSelector({
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: SeasonRoundSelectorProps) {
  const router = useRouter();

  function navigate(seasonId: number, round: number | undefined) {
    const params = new URLSearchParams(window.location.search);
    params.set("kausi", String(seasonId));
    if (round === undefined) {
      params.delete("kierros");
    } else {
      params.set("kierros", String(round));
    }
    router.push(`/?${params.toString()}`);
  }

  return (
    <form action="/" method="get" className="mb-6 flex flex-wrap items-center gap-3">
      <label className="text-sm text-zinc-600" htmlFor="kausi">
        Kausi
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        defaultValue={selectedSeasonId}
        id="kausi"
        name="kausi"
        onChange={(event) => navigate(Number(event.target.value), selectedRound)}
      >
        {seasons.map((season) => (
          <option key={season.seasonId} value={season.seasonId}>
            {season.label}
          </option>
        ))}
      </select>

      <label className="text-sm text-zinc-600" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        defaultValue={selectedRound ?? ""}
        id="kierros"
        name="kierros"
        onChange={(event) => {
          const { value } = event.target;
          navigate(selectedSeasonId, value === "" ? undefined : Number(value));
        }}
      >
        <option value="">Koko kausi</option>
        {availableRounds.map((round) => (
          <option key={round} value={round}>
            {`Kierros ${round}`}
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
