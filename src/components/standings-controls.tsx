"use client";

import { useRouter } from "next/navigation";
import type { Competition } from "@/lib/competitions";
import type { SeasonOption } from "@/lib/seasons";
import { CompetitionSelect } from "./competition-select";
import { SeasonSelect } from "./season-select";

type StandingsControlsProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  competitions: Competition[];
  selectedCompetitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
  availableRounds: number[];
  selectedRound: number | undefined;
};

/**
 * `Kilpailu`, `Kausi` and `Kierros` in one plain GET form, so changing one
 * resubmits all three. The `Näytä` button shows only when scripting is
 * unavailable.
 *
 * decisions/003-standings-after-selected-round.md
 * decisions/006-other-competitions.md
 */
export function StandingsControls({
  basePath,
  competitions,
  selectedCompetitionCode,
  seasons,
  selectedSeasonId,
  availableRounds,
  selectedRound,
}: Readonly<StandingsControlsProps>) {
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
    router.push(`${basePath}/sarjataulukko?${params.toString()}`);
  }

  return (
    <form
      action={`${basePath}/sarjataulukko`}
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
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

      <label className="text-sm text-muted" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-border px-3 py-2"
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
        <button className="rounded border border-border px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
