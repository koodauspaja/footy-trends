import type { SeasonOption } from "@/lib/seasons";

type SeasonSelectProps = {
  seasons: SeasonOption[];
  selectedSeasonId: number;
  onChange: (seasonId: number) => void;
};

/**
 * The `Kausi` label and `<select>` only: no `<form>`, no navigation. Shared
 * between the home page and the team page.
 *
 * decisions/004-listing-matches-for-selected-team.md
 */
export function SeasonSelect({ seasons, selectedSeasonId, onChange }: Readonly<SeasonSelectProps>) {
  return (
    <>
      <label className="text-sm text-muted" htmlFor="kausi">
        Kausi
      </label>
      <select
        className="rounded border border-border px-3 py-2"
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
