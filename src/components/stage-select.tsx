import { getStageName } from "@/lib/cup-stages";

type StageSelectProps = {
  availableStages: string[];
  selectedStage: string;
  onChange: (stage: string) => void;
};

/**
 * The `Vaihe` label + `<select>` for a cup's match list — the counterpart to
 * `RoundSelect`, which cannot be reused: a cup's `matchday` is a leg number
 * (1 or 2, and 0 for a final), not a round, so there is no 1..n range to list.
 *
 * Controlled via `value` for the same reason `RoundSelect` is: the stage can
 * also change through links elsewhere on the page.
 */
export function StageSelect({
  availableStages,
  selectedStage,
  onChange,
}: Readonly<StageSelectProps>) {
  return (
    <>
      <label className="text-sm text-zinc-600" htmlFor="vaihe">
        Vaihe
      </label>
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        value={selectedStage}
        id="vaihe"
        name="vaihe"
        onChange={(event) => onChange(event.target.value)}
      >
        {availableStages.map((stage) => (
          <option key={stage} value={stage}>
            {getStageName(stage)}
          </option>
        ))}
      </select>
    </>
  );
}
