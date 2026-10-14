import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  type FavouriteCompetitionEntry,
  FavouritesPage,
  type FavouriteTeamEntry,
} from "@/components/favourites-page";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { auth } from "@/lib/auth";
import { competitionNameFor, competitionOptionsFor } from "@/lib/competition-preferences";
import { parseCompetitionKey, parseTeamKey } from "@/lib/favourite-keys";
import { getFavouriteKeys, resolveTeamNames } from "@/lib/favourites";
import { logger } from "@/lib/logger";
import { REGION_SEGMENTS, type RegionSegment } from "@/lib/regions";

const HEADING = "Suosikit";

export const metadata: Metadata = { title: HEADING };

/**
 * Per-reader, so it can never be prerendered.
 *
 * decisions/026-favourites.md
 */
export const dynamic = "force-dynamic";

/**
 * `/suosikit`: the reader's favourite teams and competitions, read on the
 * server as `/asetukset` is.
 *
 * decisions/026-favourites.md
 * decisions/325-taso-finland-links.md
 */
export default async function Favourites() {
  const requestHeaders = await headers();

  // Its own guard, like the settings page: a failure is not "signed out".
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch (error) {
    logger.error({ err: error }, "Reading the session on the favourites page failed");
    return (
      <PageShell heading={HEADING}>
        <Notice>Suosikkien lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell heading={HEADING}>
        <SignInPrompt message="Kirjaudu sisään nähdäksesi suosikkisi." />
      </PageShell>
    );
  }

  let teams: FavouriteTeamEntry[] = [];
  let competitions: FavouriteCompetitionEntry[] = [];
  try {
    const keys = await getFavouriteKeys(session.user.id);

    const parsedTeams = keys.teams
      .map(parseTeamKey)
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null);

    // Alphabetically, by the Finnish collation, so Ä sorts after Z and not
    // beside A. A team we could not name goes last.
    const named = (await resolveTeamNames(parsedTeams)).toSorted((left, right) => {
      if (left.name === null || right.name === null) {
        return Number(left.name === null) - Number(right.name === null);
      }
      return left.name.localeCompare(right.name, "fi");
    });

    teams = named.map((team) => ({
      ...team,
      // Built by `resolveTeamNames`, so Finland's national sides reach their own
      // pages and not an id route that has none.
      href: team.name === null ? null : team.href,
    }));

    competitions = keys.competitions
      .map(parseCompetitionKey)
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null)
      // Registry order: within a region the order the registry lists them, and the
      // regions in the order the app shows them. A code the registry no longer has
      // sorts last, with the rest of its region.
      .toSorted((left, right) => {
        const byRegion =
          REGION_SEGMENTS.indexOf(left.region) - REGION_SEGMENTS.indexOf(right.region);
        if (byRegion !== 0) return byRegion;

        const order = (entry: { region: RegionSegment; code: string }) => {
          const index = competitionOptionsFor(entry.region).findIndex(
            (option) => option.code === entry.code
          );
          return index === -1 ? Number.MAX_SAFE_INTEGER : index;
        };
        return order(left) - order(right);
      })
      .map(({ region, code }) => {
        // Validated against the registry on read, never trusted from the row:
        // a competition can be retired long after someone favourited it, and
        // the page has to say so rather than link nowhere.
        const known = competitionOptionsFor(region).some((option) => option.code === code);
        return {
          region,
          code,
          name: known ? competitionNameFor(region, code) : null,
          href: `/${region}/sarjataulukko?kilpailu=${code}`,
        };
      });
  } catch (error) {
    logger.error({ err: error }, "Reading favourites failed");
    return (
      <PageShell heading={HEADING}>
        <Notice>Suosikkien lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }

  return (
    <PageShell heading={HEADING}>
      <FavouritesPage competitions={competitions} teams={teams} />
    </PageShell>
  );
}
