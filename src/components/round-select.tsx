type RoundSelectProps = {
  availableRounds: number[];
  selectedRound: number;
  onChange: (round: number) => void;
};

/**
 * The `Kierros` label and `<select>` only, for the season-wide match list. No
 * `Koko kausi` option: a round is always required. Controlled via `value`, as
 * the round also changes through the page's ◀/▶ links.
 *
 * decisions/005-listing-matches-for-selected-season.md
 */
export function RoundSelect({
  availableRounds,
  selectedRound,
  onChange,
}: Readonly<RoundSelectProps>) {
  return (
    <>
      <label className="text-sm text-muted" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-border px-3 py-2"
        value={selectedRound}
        id="kierros"
        name="kierros"
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {availableRounds.map((round) => (
          <option key={round} value={round}>
            {`Kierros ${round}`}
          </option>
        ))}
      </select>
    </>
  );
}
