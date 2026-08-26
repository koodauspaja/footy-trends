import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { type CompetitionRegion, competitionsInRegion } from "@/lib/competitions";

export const PICKER_HEADING = "Valitse kilpailu";

/**
 * One region's competition list — the body of `/ulkomaat` and `/maajoukkueet`,
 * which differ only in which competitions they show and where they link.
 *
 * `object-contain` because not every icon is a flag: the World area has none,
 * so the World Cup carries a 3:1 wordmark that must not be stretched into a
 * 3:2 slot. See specs/016-world-cup-and-euro.md.
 */
export function CompetitionPicker({
  region,
  basePath,
}: Readonly<{ region: CompetitionRegion; basePath: string }>) {
  return (
    <PageShell heading={PICKER_HEADING}>
      <ul className="flex flex-col gap-3">
        {competitionsInRegion(region).map((competition) => (
          <li key={competition.code}>
            <Link
              className="flex items-center gap-3 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={`${basePath}/sarjataulukko?kilpailu=${competition.code}`}
            >
              {/* biome-ignore lint/performance/noImgElement: a tiny SVG icon, not worth next/image's overhead */}
              <img
                alt={competition.country}
                className="h-4 w-6 object-contain"
                height={16}
                src={competition.flagUrl}
                width={24}
              />
              {competition.name}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
