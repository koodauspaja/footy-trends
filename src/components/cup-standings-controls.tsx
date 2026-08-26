"use client";

import { useRouter } from "next/navigation";
import type { Competition } from "@/lib/competitions";
import type { SeasonOption } from "@/lib/seasons";
import { CompetitionSelect } from "./competition-select";
import { SeasonSelect } from "./season-select";

type CupStandingsControlsProps = {
  competitions: Competition[];
  selectedCompetitionCode: string;
  seasons: SeasonOption[];
  selectedSeasonId: number;
};

/**
 * `Kilpailu` + `Kausi` for a cup's standings page — `StandingsControls`
 * without the `Kierros` select.
 *
 * A cup page has no round selector: its knockout matchdays are leg numbers
 * rather than rounds, and the phase tables it shows are always the phase's
 * full table. `Vaihe` lives on the match list instead, so the two controls
 * never sit side by side answering the same question.
 *
 * `kierros` is cleared on navigation so a round carried over from a league
 * competition cannot survive the switch into a cup.
 */
export function CupStandingsControls({
  competitions,
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
    router.push(`/ulkomaat/sarjataulukko?${params.toString()}`);
  }

  return (
    <form
      action="/ulkomaat/sarjataulukko"
      method="get"
      className="mb-6 flex flex-wrap items-center gap-3"
    >
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode={selectedCompetitionCode}
        onChange={(code) => navigate(code, selectedSeasonId)}
      />

      <SeasonSelect
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={(seasonId) => navigate(selectedCompetitionCode, seasonId)}
      />

      <noscript>
        <button className="rounded border border-zinc-300 px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
