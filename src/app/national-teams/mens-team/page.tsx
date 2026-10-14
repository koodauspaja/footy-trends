import type { Metadata } from "next";
import { NationalTeamPage } from "@/components/national-team-page";
import { MENS_TEAM } from "@/lib/national-team";

export const metadata: Metadata = { title: MENS_TEAM.displayName };

/**
 * Rendered per request, never prerendered. Unlike the pages that read
 * `searchParams`, this one takes no parameters, so Next would prerender it at
 * build time, where the database cannot be reached.
 *
 * decisions/017-huuhkajat.md
 * decisions/182-national-team-pages-not-prerendered.md
 */
export const dynamic = "force-dynamic";

// Called as a function rather than rendered as JSX, matching the region pages:
// it returns the shared server component's promise, so the page resolves in one
// pass. See src/app/foreign/standings/page.tsx.
export default function MensTeam() {
  return NationalTeamPage({ team: MENS_TEAM });
}
