/**
 * The header's second crumb: which region the reader is inside, if any.
 *
 * Kept apart from `SiteHeader` so the path-to-region mapping is unit-testable
 * without rendering, and so the component itself stays a few lines of markup.
 */

export type RegionCrumb = {
  href: string;
  /** Finnish, like every user-facing string. */
  label: string;
};

/**
 * The three region roots, as the browser sees them. `next.config.ts` rewrites
 * these Finnish paths to English folders internally, but `usePathname()`
 * reports the public URL, which is what these match.
 */
const REGIONS: readonly RegionCrumb[] = [
  { href: "/kotimaa", label: "Kotimaa" },
  { href: "/ulkomaat", label: "Ulkomaat" },
  { href: "/maajoukkueet", label: "Maajoukkueet" },
];

/**
 * The region crumb for a path, or `null` where there should not be one.
 *
 * `null` on the front page, on any path outside the three regions, and on a
 * region's own picker page — a crumb there would link to the page already
 * being shown.
 */
export function regionCrumbFor(pathname: string): RegionCrumb | null {
  // A trailing slash is the same page, and `//` is not a different region.
  const normalised = pathname.replace(/\/+$/, "");
  if (normalised === "") return null;

  const region = REGIONS.find(
    (candidate) => normalised === candidate.href || normalised.startsWith(`${candidate.href}/`)
  );
  if (region === undefined) return null;

  return normalised === region.href ? null : region;
}
