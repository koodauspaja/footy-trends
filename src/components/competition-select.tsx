import type { Competition } from "@/lib/competitions";

type CompetitionSelectProps = {
  competitions: Competition[];
  selectedCompetitionCode: string;
  onChange: (code: string) => void;
};

/**
 * The `Kilpailu` label + `<select>`, plus the selected competition's flag.
 * Flags can't be shown per-option inside a native `<select>` — `<option>`
 * only renders text, not images — so the flag reflects whichever
 * competition is currently selected instead of appearing in the dropdown
 * list itself. The picker page (plain links, not a `<select>`) shows a
 * flag per competition without this constraint.
 */
export function CompetitionSelect({
  competitions,
  selectedCompetitionCode,
  onChange,
}: Readonly<CompetitionSelectProps>) {
  const selected = competitions.find((competition) => competition.code === selectedCompetitionCode);

  return (
    <>
      <label className="text-sm text-zinc-600" htmlFor="kilpailu">
        Kilpailu
      </label>
      {selected && (
        // biome-ignore lint/performance/noImgElement: a tiny external SVG flag, not worth next/image's overhead
        <img
          src={selected.flagUrl}
          alt={selected.country}
          className="h-4 w-6"
          width={24}
          height={16}
        />
      )}
      <select
        className="rounded border border-zinc-300 px-3 py-2"
        defaultValue={selectedCompetitionCode}
        id="kilpailu"
        name="kilpailu"
        onChange={(event) => onChange(event.target.value)}
      >
        {competitions.map((competition) => (
          <option key={competition.code} value={competition.code}>
            {competition.name}
          </option>
        ))}
      </select>
    </>
  );
}
