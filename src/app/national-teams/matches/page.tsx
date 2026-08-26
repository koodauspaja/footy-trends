import type { Metadata } from "next";
import { CompetitionMatchesPage, matchesMetadata } from "@/components/competition-matches-page";

export const dynamic = "force-dynamic";

const REGION = {
  region: "national-teams",
  basePath: "/maajoukkueet",
  showCompetitionSelect: false,
} as const;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return matchesMetadata({ ...REGION, searchParams });
}

export default function MatchesPage({ searchParams }: Readonly<PageProps>) {
  return CompetitionMatchesPage({ ...REGION, searchParams });
}
