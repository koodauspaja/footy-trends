import type { Metadata } from "next";
import { MatchPage, type MatchPageOptions, matchMetadata } from "@/components/match-page";
import { WOMENS_TEAM } from "@/lib/national-team";

export const dynamic = "force-dynamic";

/** `/maajoukkueet/helmarit/ottelu/:id` — TASO's `maajp*` buckets. */
const ROUTE = {
  source: { kind: "taso", bucket: "national" },
  basePath: "/maajoukkueet/helmarit",
  teamBasePath: null,
  nationalTeam: WOMENS_TEAM,
} as const satisfies Omit<MatchPageOptions, "params">;

type PageProps = { params: Promise<{ id: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return matchMetadata({ ...ROUTE, params });
}

export default function WomensTeamMatchPage({ params }: Readonly<PageProps>) {
  return MatchPage({ ...ROUTE, params });
}
