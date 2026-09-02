import Link from "next/link";

/** One page the club does have matches on, and what to call it. */
export type TeamSeasonLink = { label: string; href: string };

const MESSAGE = "Joukkue ei pelannut tässä sarjassa tällä kaudella.";

/**
 * What a team page says when the club exists but played elsewhere.
 *
 * Distinct from `Joukkuetta ei löytynyt.`, which is what a team id nothing
 * knows about gets: promotion and relegation are ordinary, and telling a reader
 * "no such team" because a club was a tier down that year is simply wrong. The
 * heading above this already names the club, the competition and the season, so
 * the sentence needs no inflected competition name — `Veikkausliigassa`,
 * `Miesten Suomen Cupissa` are case endings this app has no business deriving
 * from a registry string. See specs/022-teams-between-tiers.md.
 */
export function TeamSeasonMissing({
  seasonLabel,
  sameSeason,
  newest,
}: Readonly<{
  seasonLabel: string;
  /** Where the club did play that season, most matches first. Often empty. */
  sameSeason: readonly TeamSeasonLink[];
  /** The club's most recent season, offered when it played nothing this one. */
  newest: TeamSeasonLink | null;
}>) {
  return (
    <>
      <p className="mb-4">{MESSAGE}</p>
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
