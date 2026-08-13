import type { SeasonOption } from "@/lib/seasons";

type SeasonSelectProps = {
  seasons: SeasonOption[];
  selectedSeasonId: number;
  onChange: (seasonId: number) => void;
};

/**
 * The `Kausi` label + `<select>` only — no `<form>`, no navigation. Shared
 * between the home page (inside a form that also has a round control) and
 * the team page (its own, season-only form), so both get the same Finnish
 * label and option list without duplicating the markup.
 */
export function SeasonSelect({ seasons, selectedSeasonId, onChange }: SeasonSelectProps) {
  return (
    <>
      <label className="text-sm text-zinc-600" htmlFor="kausi">
        Kausi
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        defaultValue={selectedSeasonId}
        id="kausi"
        name="kausi"
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {seasons.map((season) => (
          <option key={season.seasonId} value={season.seasonId}>
            {season.label}
          </option>
        ))}
      </select>
    </>
  );
}
