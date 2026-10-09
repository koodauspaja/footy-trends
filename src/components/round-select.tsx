type RoundSelectProps = {
  availableRounds: number[];
  selectedRound: number | undefined;
  onChange: (round: number | undefined) => void;
  /** Offers `Koko kausi` first, which selects no round. */
  wholeSeason?: boolean;
};

/**
 * The `Kierros` label and `<select>` only. A round is always required on the
 * season-wide match list; a table passes `wholeSeason` for a `Koko kausi`
 * option. Controlled via `value`, as the round also changes through the page's
 * ◀/▶ links and the browser's Back button.
 *
 * decisions/005-listing-matches-for-selected-season.md
 * decisions/532-one-transaction-type-one-round-dropdown.md
 */
export function RoundSelect({
  availableRounds,
  selectedRound,
  onChange,
  wholeSeason = false,
}: Readonly<RoundSelectProps>) {
  return (
    <>
      <label className="text-sm text-muted" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-border px-3 py-2"
        value={selectedRound ?? ""}
        id="kierros"
        name="kierros"
        onChange={(event) => {
          const { value } = event.target;
          onChange(value === "" ? undefined : Number(value));
        }}
      >
        {wholeSeason && <option value="">Koko kausi</option>}
        {availableRounds.map((round) => (
          <option key={round} value={round}>
            {`Kierros ${round}`}
          </option>
        ))}
      </select>
    </>
  );
}
