import type { SeasonOption } from "@/lib/competitions/seasons";

type SeasonSelectProps = {
  seasons: SeasonOption[];
  selectedSeasonId: number;
  onChange: (seasonId: number) => void;
};

/**
 * What a season with no matches yet says in the selector, beside its year.
 *
 * decisions/878-empty-season-not-selectable.md
 */
export const NO_MATCHES = "Ei otteluita tällä kaudella";

/**
 * The `Kausi` label and `<select>` only: no `<form>`, no navigation. Shared
 * between the home page and the team page.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/696-headings-and-spacing.md
 * decisions/878-empty-season-not-selectable.md
 */
export function SeasonSelect({ seasons, selectedSeasonId, onChange }: Readonly<SeasonSelectProps>) {
  return (
    <span className="flex items-center gap-3">
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
          <option disabled={season.noMatches} key={season.seasonId} value={season.seasonId}>
            {season.noMatches ? `${season.label} – ${NO_MATCHES}` : season.label}
          </option>
        ))}
      </select>
    </span>
  );
}
