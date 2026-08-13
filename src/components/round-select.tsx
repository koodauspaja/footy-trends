type RoundSelectProps = {
  availableRounds: number[];
  selectedRound: number;
  onChange: (round: number) => void;
};

/**
 * The `Kierros` label + `<select>` only, for the season-wide match list. No
 * "Koko kausi" option here — unlike the home page's round selector, a round
 * is always required, since it's this page's chunking mechanism rather than
 * an optional filter.
 *
 * Controlled via `value`, not `defaultValue`: the round can also change
 * through the page's ◀/▶ links, which don't go through this select's own
 * `onChange` — an uncontrolled select would keep showing the round it was
 * first mounted with after one of those link clicks.
 */
export function RoundSelect({ availableRounds, selectedRound, onChange }: RoundSelectProps) {
  return (
    <>
      <label className="text-sm text-zinc-600" htmlFor="kierros">
        Kierros
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
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
