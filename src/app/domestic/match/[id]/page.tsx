import type { Metadata } from "next";
import { MatchPage, type MatchPageOptions, matchMetadata } from "@/components/match-page";

export const dynamic = "force-dynamic";

/**
 * `/kotimaa/ottelu/:id` resolves against `taso_matches`, excluding the
 * national-team buckets that share the table. See specs/019-match-page.md.
 */
const ROUTE = {
  source: { kind: "taso", bucket: "domestic" },
  basePath: "/kotimaa",
  teamBasePath: "/kotimaa",
} as const satisfies Omit<MatchPageOptions, "params">;

type PageProps = { params: Promise<{ id: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return matchMetadata({ ...ROUTE, params });
}

export default function DomesticMatchPage({ params }: Readonly<PageProps>) {
  return MatchPage({ ...ROUTE, params });
}
