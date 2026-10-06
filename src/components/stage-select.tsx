import { getStageName } from "@/lib/cup-stages";

type StageSelectProps = {
  availableStages: string[];
  selectedStage: string;
  onChange: (stage: string) => void;
};

/**
 * The `Vaihe` label and `<select>` for a cup's match list. Controlled via
 * `value`, as `RoundSelect` is: the stage can also change through links
 * elsewhere on the page.
 *
 * decisions/014-champions-league.md
 */
export function StageSelect({
  availableStages,
  selectedStage,
  onChange,
}: Readonly<StageSelectProps>) {
  return (
    <>
      <label className="text-sm text-muted" htmlFor="vaihe">
        Vaihe
      </label>
      <select
        className="rounded border border-border px-3 py-2"
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
