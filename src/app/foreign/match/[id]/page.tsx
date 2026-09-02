import type { Metadata } from "next";
import { MatchPage, type MatchPageOptions, matchMetadata } from "@/components/match-page";

export const dynamic = "force-dynamic";

/** `/ulkomaat/ottelu/:id` — football-data rows whose competition is a foreign one. */
const ROUTE = {
  source: { kind: "football-data", region: "foreign" },
  basePath: "/ulkomaat",
  teamBasePath: "/ulkomaat",
} as const satisfies Omit<MatchPageOptions, "params">;

type PageProps = { params: Promise<{ id: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return matchMetadata({ ...ROUTE, params });
}

export default function ForeignMatchPage({ params }: Readonly<PageProps>) {
  return MatchPage({ ...ROUTE, params });
}
