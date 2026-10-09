import type { Metadata } from "next";
import {
  HeadToHeadPage,
  type HeadToHeadPageOptions,
  headToHeadMetadata,
} from "@/components/head-to-head-page";
import { MENS_TEAM } from "@/lib/national-team";

export const dynamic = "force-dynamic";

/**
 * `/maajoukkueet/huuhkajat/kohtaamiset/:a/:b`: Finland's own meetings, which are
 * TASO's. Its own route because its match pages have their own prefix;
 * `nationalTeam` is what names the competitions.
 *
 * decisions/042-head-to-head-view.md
 */
const ROUTE = {
  source: { kind: "taso", bucket: "national" },
  basePath: "/maajoukkueet/huuhkajat",
  nationalTeam: MENS_TEAM,
} as const satisfies Omit<HeadToHeadPageOptions, "params">;

type PageProps = { params: Promise<{ a: string; b: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return headToHeadMetadata({ ...ROUTE, params });
}

export default function MensTeamHeadToHeadPage({ params }: Readonly<PageProps>) {
  return HeadToHeadPage({ ...ROUTE, params });
}
