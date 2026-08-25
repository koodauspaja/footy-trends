import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { DOMESTIC_COMPETITIONS } from "@/lib/domestic-competitions";

const HEADING = "Valitse kilpailu";

export const metadata: Metadata = {
  title: HEADING,
};

export default function Domestic() {
  return (
    <PageShell heading={HEADING}>
      <ul className="flex flex-col gap-3">
        {DOMESTIC_COMPETITIONS.map((competition) => (
          <li key={competition.code}>
            <Link
              className="flex items-center gap-3 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={`/kotimaa/sarjataulukko?kilpailu=${competition.code}`}
            >
              <span aria-hidden className="text-xl leading-none">
                🇫🇮
              </span>
              {competition.name}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
