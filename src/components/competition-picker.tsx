import Link from "next/link";
import { FavouriteToggle } from "@/components/favourite-toggle";
import { PageShell } from "@/components/page-shell";
import { type CompetitionRegion, competitionsInRegion } from "@/lib/competitions";
import type { RegionSegment } from "@/lib/regions";

export const PICKER_HEADING = "Valitse kilpailu";

/**
 * One row of the picker, independent of where it came from.
 *
 * A region is no longer necessarily one provider's: `/maajoukkueet` holds two
 * football-data tournaments and TASO-backed Huuhkajat, which has no
 * football-data code and so cannot live in `SUPPORTED_COMPETITIONS` — that
 * list also feeds `kilpailu` validation, and an entry there would let
 * `?kilpailu=…` resolve on a standings page that cannot serve it. So the
 * region page concatenates instead. See specs/017-huuhkajat.md.
 */
export type PickerEntry = {
  key: string;
  name: string;
  flagUrl: string;
  /** Finnish country name, for the flag's alt text. */
  country: string;
  href: string;
};

/**
 * One region's competition list — the body of `/ulkomaat` and `/maajoukkueet`,
 * which differ only in which competitions they show and where they link.
 *
 * `object-contain` because not every icon is a flag: the World area has none,
 * so the World Cup carries a 3:1 wordmark that must not be stretched into a
 * 3:2 slot. See specs/016-world-cup-and-euro.md.
 */
export function CompetitionPicker({
  region,
  basePath,
  favouriteRegion,
  extraEntries = [],
}: Readonly<{
  region: CompetitionRegion;
  basePath: string;
  /**
   * The Finnish segment a favourite is stored under, when this list should
   * offer stars (specs/026-favourites.md).
   *
   * Separate from `region` above, which is football-data's notion — and only
   * the registry rows get a star, because `extraEntries` holds Huuhkajat and
   * Helmarit, which are teams rather than competitions.
   */
  favouriteRegion?: RegionSegment;
  /** Rows from outside `SUPPORTED_COMPETITIONS`, rendered after it. */
  extraEntries?: readonly PickerEntry[];
}>) {
  const entries: (PickerEntry & { isCompetition: boolean })[] = [
    ...competitionsInRegion(region).map((competition) => ({
      isCompetition: true,
      key: competition.code,
      name: competition.name,
      flagUrl: competition.flagUrl,
      country: competition.country,
      href: `${basePath}/sarjataulukko?kilpailu=${competition.code}`,
    })),
    ...extraEntries.map((entry) => ({ ...entry, isCompetition: false })),
  ];

  return (
    <PageShell heading={PICKER_HEADING}>
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li className="flex items-center gap-2" key={entry.key}>
            <Link
              className="flex flex-1 items-center gap-3 rounded border border-border-subtle px-4 py-3 hover:bg-surface"
              href={entry.href}
            >
              {/* biome-ignore lint/performance/noImgElement: a tiny SVG icon, not worth next/image's overhead */}
              <img
                alt={entry.country}
                className="h-4 w-6 object-contain"
                height={16}
                src={entry.flagUrl}
                width={24}
              />
              {entry.name}
            </Link>
            {/* Outside the link, not inside it: a button within an anchor is
                invalid, and the click would navigate instead of favouriting.
                Only registry rows — `extraEntries` are teams. */}
            {favouriteRegion !== undefined && entry.isCompetition && (
              <FavouriteToggle
                code={entry.key}
                kind="competition"
                name={entry.name}
                region={favouriteRegion}
              />
            )}
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
