"use client";

import { useRouter } from "next/navigation";
import type { Competition } from "@/lib/competitions";
import type { SeasonOption } from "@/lib/seasons";
import { CompetitionSelect } from "./competition-select";
import { SeasonSelect } from "./season-select";

type StandingsControlsProps = {
  competitions: Competition[];
  selectedCompetitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * Plain GET form so all three selections still work without JavaScript; the
 * `Näytä` button is only shown when scripting is unavailable, because with
 * scripting each change handler navigates immediately. `Kilpailu`, `Kausi`,
 * and `Kierros` live in one form so changing any one of them resubmits all
 * three together — no selection is lost when another changes.
 */
export function StandingsControls({
  competitions,
  selectedCompetitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: StandingsControlsProps) {
  const router = useRouter();

  function navigate(competitionCode: string, seasonId: number, round: number | undefined) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    if (round === undefined) {
      params.delete("kierros");
    } else {
      params.set("kierros", String(round));
    }
    router.push(`/sarjataulukko?${params.toString()}`);
  }

  return (
    <form action="/sarjataulukko" method="get" className="mb-6 flex flex-wrap items-center gap-3">
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode={selectedCompetitionCode}
        onChange={(code) => navigate(code, selectedSeasonId, selectedRound)}
      />

      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(selectedCompetitionCode, seasonId, selectedRound)}
      />

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
          navigate(
            selectedCompetitionCode,
            selectedSeasonId,
            value === "" ? undefined : Number(value)
          );
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
