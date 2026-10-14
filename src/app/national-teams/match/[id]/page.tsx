import type { Metadata } from "next";
import { MatchPage, type MatchPageOptions, matchMetadata } from "@/components/match-page";

export const dynamic = "force-dynamic";

/**
 * `/maajoukkueet/ottelu/:id`: the World Cup and the European Championship,
 * which come from football-data. Huuhkajat and Helmarit are TASO's, and have
 * their own routes.
 *
 * decisions/019-match-page.md
 */
const ROUTE = {
  source: { kind: "football-data", region: "national-teams" },
  basePath: "/maajoukkueet",
  teamBasePath: "/maajoukkueet",
} as const satisfies Omit<MatchPageOptions, "params">;

type PageProps = { params: Promise<{ id: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return matchMetadata({ ...ROUTE, params });
}

export default function NationalTeamsMatchPage({ params }: Readonly<PageProps>) {
  return MatchPage({ ...ROUTE, params });
}
