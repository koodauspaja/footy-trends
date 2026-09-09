import type { Metadata } from "next";
import Link from "next/link";
import { FavouriteToggle } from "@/components/favourite-toggle";
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
          <li className="flex items-center gap-2" key={competition.code}>
            <Link
              className="flex flex-1 items-center gap-3 rounded border border-border-subtle px-4 py-3 hover:bg-surface"
              href={`/kotimaa/sarjataulukko?kilpailu=${competition.code}`}
            >
              <span aria-hidden className="text-xl leading-none">
                🇫🇮
              </span>
              {competition.name}
            </Link>
            {/* Beside the link rather than inside it: a button in an anchor is
                invalid, and the click would navigate (specs/026-favourites.md). */}
            <FavouriteToggle
              code={competition.code}
              kind="competition"
              name={competition.name}
              region="kotimaa"
            />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
