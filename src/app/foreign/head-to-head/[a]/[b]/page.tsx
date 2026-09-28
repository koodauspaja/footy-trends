import type { Metadata } from "next";
import {
  HeadToHeadPage,
  type HeadToHeadPageOptions,
  headToHeadMetadata,
} from "@/components/head-to-head-page";

export const dynamic = "force-dynamic";

/** `/ulkomaat/kohtaamiset/:a/:b` — football-data's foreign competitions. See specs/042. */
const ROUTE = {
  source: { kind: "football-data", region: "foreign" },
  basePath: "/ulkomaat",
} as const satisfies Omit<HeadToHeadPageOptions, "params">;

type PageProps = { params: Promise<{ a: string; b: string }> };

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return headToHeadMetadata({ ...ROUTE, params });
}

export default function ForeignHeadToHeadPage({ params }: Readonly<PageProps>) {
  return HeadToHeadPage({ ...ROUTE, params });
}
