import type { Metadata } from "next";
import { CompetitionTeamPage, teamMetadata } from "@/components/competition-team-page";

export const dynamic = "force-dynamic";

const REGION = {
  region: "national-teams",
  basePath: "/maajoukkueet",
  showCompetitionSelect: false,
} as const;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  return teamMetadata({ ...REGION, params, searchParams });
}

export default function TeamPage({ params, searchParams }: Readonly<PageProps>) {
  return CompetitionTeamPage({ ...REGION, params, searchParams });
}
