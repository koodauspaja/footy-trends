import type { Metadata } from "next";
import { NationalTeamPage } from "@/components/national-team-page";
import { WOMENS_TEAM } from "@/lib/national-team";

export const metadata: Metadata = { title: WOMENS_TEAM.displayName };

/**
 * Rendered per request, never prerendered.
 *
 * Every other data-backed page reads `searchParams`, which makes it dynamic on
 * its own. This one takes no parameters — it has no season selector — so Next
 * prerendered it at build time, where Railway's private network does not exist:
 * `*.railway.internal` is runtime-only, so the build container cannot resolve
 * the database at all.
 *
 * The prerender therefore failed every bucket and **baked the error page into
 * the static output**, which was then served to every visitor regardless of
 * runtime health. `/api/health` reported the database as fine throughout,
 * because it is dynamic and was genuinely fine. See #182.
 */
export const dynamic = "force-dynamic";

// Called as a function rather than rendered as JSX, matching the region pages:
// it returns the shared server component's promise, so the page resolves in one
// pass. See src/app/foreign/standings/page.tsx.
export default function WomensTeam() {
  return NationalTeamPage({ team: WOMENS_TEAM });
}
