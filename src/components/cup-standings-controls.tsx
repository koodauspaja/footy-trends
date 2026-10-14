"use client";

import { useRouter } from "next/navigation";
import type { Competition } from "@/lib/competitions";
import type { SeasonOption } from "@/lib/seasons";
import { CompetitionSelect } from "./competition-select";
import { SeasonSelect } from "./season-select";

type CupStandingsControlsProps = {
  /** The region's Finnish URL prefix — `/ulkomaat` or `/maajoukkueet`. */
  basePath: string;
  competitions: Competition[];
  /** False where the region's competitions are separate tournaments, not views. */
  showCompetitionSelect: boolean;
  selectedCompetitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * `Kilpailu` and `Kausi` for a cup's standings page: `StandingsControls`
 * without the `Kierros` select. `kierros` is cleared on navigation.
 *
 * decisions/014-champions-league.md
 */
export function CupStandingsControls({
  basePath,
  competitions,
  showCompetitionSelect,
  selectedCompetitionCode,
  seasons,
  selectedSeasonId,
}: Readonly<CupStandingsControlsProps>) {
  const router = useRouter();

  function navigate(competitionCode: string, seasonId: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("kilpailu", competitionCode);
    params.set("kausi", String(seasonId));
    params.delete("kierros");
    router.push(`${basePath}/sarjataulukko?${params.toString()}`);
  }

  return (
    <form
      action={`${basePath}/sarjataulukko`}
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
      {showCompetitionSelect && (
        <CompetitionSelect
          competitions={competitions}
          onChange={(code) => navigate(code, selectedSeasonId)}
          selectedCompetitionCode={selectedCompetitionCode}
        />
      )}

      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(selectedCompetitionCode, seasonId)}
      />

      <noscript>
        <button className="rounded border border-border px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
