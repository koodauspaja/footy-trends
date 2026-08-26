import type { Metadata } from "next";
import {
  CompetitionStandingsPage,
  standingsMetadata,
} from "@/components/competition-standings-page";

export const dynamic = "force-dynamic";

const REGION = {
  region: "national-teams",
  basePath: "/maajoukkueet",
  showCompetitionSelect: false,
} as const;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return standingsMetadata({ ...REGION, searchParams });
}

export default function StandingsPage({ searchParams }: Readonly<PageProps>) {
  return CompetitionStandingsPage({ ...REGION, searchParams });
}
