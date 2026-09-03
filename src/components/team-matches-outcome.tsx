import Link from "next/link";
import type { ReactNode } from "react";

/** One page the club does have matches on, and what to call it. */
export type TeamSeasonLink = { label: string; href: string };

const MISSING = "Joukkue ei pelannut tässä sarjassa tällä kaudella.";
const NOT_FOUND = "Joukkuetta ei löytynyt.";
const EMPTY = "Otteluita ei ole saatavilla.";
const ERROR = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

/**
 * What a team page shows below its selector: the matches, or why there are
 * none.
 *
 * Five outcomes, decided in one place because both team pages had the same six
 * conditions written out and Sonar counted fourteen duplicated lines:
 *
 * - matches to show — the caller's table, passed in
 * - the club exists but played elsewhere that season — an explanation and a
 *   link to where it was
 * - the competition and season exist for this club but hold no matches yet
 * - nothing is stored for this id at all
 * - the lookup failed, which is none of the above and must not be reported as
 *   any of them
 *
 * The heading above already names the club, the competition and the season, so
 * the missing-season sentence needs no inflected competition name — Finnish
 * case endings are not something to derive from a registry string. See
 * specs/022-teams-between-tiers.md.
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

  // The match list's own verdict comes first, because it is the one about this
  // page. `empty` is only ever returned when the refresh succeeded and the
  // season holds no matches for anyone (`refreshFailed ? error : empty` in both
  // services), so it stays true whether or not the club's other seasons could
  // be read — and reporting an outage instead would be less accurate, not more.
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
              <Link className="hover:underline" href={link.href}>
                {link.label}
              </Link>
            </span>
          ))}
        </p>
      )}
      {sameSeason.length === 0 && newest !== null && (
        <p className="mb-4">
          {"Joukkueen uusin kausi: "}
          <Link className="hover:underline" href={newest.href}>
            {newest.label}
          </Link>
        </p>
      )}
    </>
  );
}
