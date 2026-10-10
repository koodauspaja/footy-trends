import type { ReactNode } from "react";
import { SameRouteLink } from "@/components/same-route-link";

/**
 * One page the club does have matches on, and what to call it.
 *
 * decisions/022-teams-between-tiers.md
 */
export type TeamSeasonLink = { label: string; href: string };

const MISSING = "Joukkue ei pelannut tässä sarjassa tällä kaudella.";
const NOT_FOUND = "Joukkuetta ei löytynyt.";
const EMPTY = "Otteluita ei ole saatavilla.";
const ERROR = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

/**
 * What a team page shows below its selector: the matches, or why there are
 * none. Five outcomes, decided in one place; a failed lookup is its own and
 * must not be reported as any of the others.
 *
 * decisions/022-teams-between-tiers.md
 */
export type TeamOutcome = {
  /** The match list's own status, as its service reports it. */
  result: "ok" | "empty" | "error" | "not_found";
  /** Whether the club's own data could be read, and whether it has any. */
  seasons: "ok" | "not_found" | "error";
  seasonLabel: string;
  /** Where the club did play that season, most matches first. Often empty. */
  sameSeason: readonly TeamSeasonLink[];
  /** The club's most recent season, offered when it played nothing this one. */
  newest: TeamSeasonLink | null;
};

export function TeamMatchesOutcome({
  outcome,
  table,
}: Readonly<{
  outcome: TeamOutcome;
  /** The rendered match list, shown when there are matches. */
  table: ReactNode;
}>) {
  const { result, seasons, seasonLabel, sameSeason, newest } = outcome;

  // The match list's own verdict comes first: it is the one about this page.
  // `empty` is only ever returned when the refresh succeeded and the season
  // holds no matches for anyone.
  if (result === "ok") return table;
  if (result === "empty") return <p>{EMPTY}</p>;
  if (result === "error") return <p>{ERROR}</p>;

  // A club that exists but played elsewhere is not an unknown club, and a
  // lookup that failed is neither.
  if (seasons === "error") return <p>{ERROR}</p>;
  if (seasons === "not_found") return <p>{NOT_FOUND}</p>;

  return (
    <>
      <p className="mb-4">{MISSING}</p>
      {sameSeason.length > 0 && (
        <p className="mb-4">
          {`Kaudella ${seasonLabel}: `}
          {sameSeason.map((link, index) => (
            <span key={link.href}>
              {index > 0 && ", "}
              <SameRouteLink className="hover:underline" href={link.href}>
                {link.label}
              </SameRouteLink>
            </span>
          ))}
        </p>
      )}
      {sameSeason.length === 0 && newest !== null && (
        <p className="mb-4">
          {"Joukkueen uusin kausi: "}
          <SameRouteLink className="hover:underline" href={newest.href}>
            {newest.label}
          </SameRouteLink>
        </p>
      )}
    </>
  );
}
