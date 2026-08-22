import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const HEADING = "Valitse alue";

export const metadata: Metadata = {
  title: HEADING,
};

const REGIONS = [
  { href: "/kotimaa", label: "Kotimaa", description: "Suomalaiset sarjat" },
  { href: "/ulkomaat", label: "Ulkomaat", description: "Kansainväliset sarjat" },
] as const;

export default function Home() {
  return (
    <PageShell heading={HEADING}>
      <ul className="flex flex-col gap-3">
        {REGIONS.map((region) => (
          <li key={region.href}>
            <Link
              className="flex flex-col gap-1 rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={region.href}
            >
              <span className="font-medium">{region.label}</span>
              <span className="text-sm text-zinc-600">{region.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
