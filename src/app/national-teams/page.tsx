import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { competitionsInRegion } from "@/lib/competitions";

const HEADING = "Valitse kilpailu";

export const metadata: Metadata = {
  title: HEADING,
};

export default function NationalTeams() {
  return (
    <PageShell heading={HEADING}>
      <ul className="flex flex-col gap-3">
        {competitionsInRegion("national-teams").map((competition) => (
          <li key={competition.code}>
            <Link
              className="flex items-center gap-3 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={`/maajoukkueet/sarjataulukko?kilpailu=${competition.code}`}
            >
              {/* biome-ignore lint/performance/noImgElement: a tiny SVG flag, not worth next/image's overhead */}
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
