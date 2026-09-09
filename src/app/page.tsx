import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { StartRedirect } from "@/components/start-redirect";

const HEADING = "Valitse alue";

export const metadata: Metadata = {
  title: HEADING,
};

const REGIONS = [
  { href: "/kotimaa", label: "Kotimaa", description: "Suomalaiset sarjat" },
  { href: "/ulkomaat", label: "Ulkomaat", description: "Kansainväliset sarjat" },
  // One word, like the two above, and accurate for everything this region
  // holds: the World Cup and the Euro are competitions between national teams,
  // and #166/#167 add Finland's own. See specs/016-world-cup-and-euro.md.
  { href: "/maajoukkueet", label: "Maajoukkueet", description: "Arvokisat ja maaottelut" },
] as const;

export default function Home() {
  return (
    <PageShell heading={HEADING}>
      {/* Client-side, so this page keeps its prerender — see the component. */}
      <StartRedirect />
      <ul className="flex flex-col gap-3">
        {REGIONS.map((region) => (
          <li key={region.href}>
            <Link
              className="flex flex-col gap-1 rounded border border-border-subtle px-4 py-3 hover:bg-surface"
              href={region.href}
            >
              <span className="font-medium">{region.label}</span>
              <span className="text-sm text-muted">{region.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
