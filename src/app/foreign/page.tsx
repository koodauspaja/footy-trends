import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { SUPPORTED_COMPETITIONS } from "@/lib/competitions";

const HEADING = "Valitse kilpailu";

export const metadata: Metadata = {
  title: HEADING,
};

export default function Foreign() {
  return (
    <PageShell heading={HEADING}>
      <ul className="flex flex-col gap-3">
        {SUPPORTED_COMPETITIONS.map((competition) => (
          <li key={competition.code}>
            <Link
              className="flex items-center gap-3 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={`/ulkomaat/sarjataulukko?kilpailu=${competition.code}`}
            >
              {/* biome-ignore lint/performance/noImgElement: a tiny external SVG flag, not worth next/image's overhead */}
              <img
                src={competition.flagUrl}
                alt={competition.country}
                width={24}
                height={16}
                className="h-4 w-6"
              />
              {competition.name}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
