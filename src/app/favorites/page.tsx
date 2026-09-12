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
 * `/suosikit`, from specs/026-favourites.md.
 *
 * Per-reader by definition, so it can never be prerendered — the same as
 * `/asetukset`, and read on the server for the same reason: everything it shows
 * is server data, and one render beats a client endpoint per section.
 */
export const dynamic = "force-dynamic";

export default async function Favourites() {
  const requestHeaders = await headers();

  /**
   * Its own guard, like the settings page: reading the session hits the
   * database, and an unhandled failure here would render an error page where
   * the reader expected their list. A failure is also not "signed out" — that
   * would be a claim we cannot make.
   */
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

    /**
     * Alphabetically, as the spec promises — and by the Finnish collation, so
     * Ä sorts after Z rather than beside A. A team we could not name has no
     * place in that order, so it goes last rather than sorting as "".
     */
    const named = (await resolveTeamNames(parsedTeams)).toSorted((left, right) => {
      if (left.name === null || right.name === null) {
        return Number(left.name === null) - Number(right.name === null);
      }
      return left.name.localeCompare(right.name, "fi");
    });

    teams = named.map((team) => ({
      ...team,
      // Built by `resolveTeamNames`, so Finland's national sides reach their own
      // pages rather than an id route that has none (#325).
      href: team.name === null ? null : team.href,
    }));

    competitions = keys.competitions
      .map(parseCompetitionKey)
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null)
      /**
       * Registry order, as the spec promises: within a region the order the
       * registry itself lists them, and the regions in the order the app shows
       * them. Insertion order would mean the page rearranges itself as the
       * reader adds favourites, and query order is not even that stable.
       *
       * A code the registry no longer has sorts last, with the rest of its
       * region — it still has a row and still has to be removable.
       */
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
