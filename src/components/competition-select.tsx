import type { Competition } from "@/lib/competitions";

type CompetitionSelectProps = {
  competitions: Competition[];
  selectedCompetitionCode: string;
  onChange: (code: string) => void;
};

/**
 * The `Kilpailu` label and `<select>`, plus the selected competition's flag:
 * an `<option>` renders only text, so the flag cannot sit in the list.
 *
 * decisions/006-other-competitions.md
 */
export function CompetitionSelect({
  competitions,
  selectedCompetitionCode,
  onChange,
}: Readonly<CompetitionSelectProps>) {
  const selected = competitions.find((competition) => competition.code === selectedCompetitionCode);

  return (
    <>
      <label className="text-sm text-muted" htmlFor="kilpailu">
        Kilpailu
      </label>
      {selected && (
        // biome-ignore lint/performance/noImgElement: a tiny external SVG flag, not worth next/image's overhead
        <img
          alt={selected.country}
          className="h-4 w-6 object-contain"
          height={16}
          src={selected.flagUrl}
          width={24}
        />
      )}
      <select
        className="rounded border border-border px-3 py-2"
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
