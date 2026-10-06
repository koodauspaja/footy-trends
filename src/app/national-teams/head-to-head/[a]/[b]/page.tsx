import type { Metadata } from "next";
import {
  HeadToHeadPage,
  type HeadToHeadPageOptions,
  headToHeadMetadata,
} from "@/components/head-to-head-page";

export const dynamic = "force-dynamic";

/**
 * `/maajoukkueet/kohtaamiset/:a/:b`: football-data's national-team
 * competitions, whose opponents are countries and so are named in Finnish.
 *
 * decisions/042-head-to-head-view.md
 */
const ROUTE = {
  source: { kind: "football-data", region: "national-teams" },
  basePath: "/maajoukkueet",
} as const satisfies Omit<HeadToHeadPageOptions, "params">;

type PageProps = { params: Promise<{ a: string; b: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return headToHeadMetadata({ ...ROUTE, params });
}

export default function NationalTeamsHeadToHeadPage({ params }: Readonly<PageProps>) {
  return HeadToHeadPage({ ...ROUTE, params });
}
