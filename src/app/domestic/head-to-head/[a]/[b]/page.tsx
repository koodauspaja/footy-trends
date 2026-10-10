import type { Metadata } from "next";
import {
  HeadToHeadPage,
  type HeadToHeadPageOptions,
  headToHeadMetadata,
} from "@/components/head-to-head-page";

export const dynamic = "force-dynamic";

/**
 * `/kotimaa/kohtaamiset/:a/:b` resolves against `taso_matches`, excluding the
 * national-team buckets that share the table.
 *
 * decisions/042-head-to-head-view.md
 */
const ROUTE = {
  source: { kind: "taso", bucket: "domestic" },
  basePath: "/kotimaa",
} as const satisfies Omit<HeadToHeadPageOptions, "params">;

type PageProps = { params: Promise<{ a: string; b: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return headToHeadMetadata({ ...ROUTE, params });
}

export default function DomesticHeadToHeadPage({ params }: Readonly<PageProps>) {
  return HeadToHeadPage({ ...ROUTE, params });
}
