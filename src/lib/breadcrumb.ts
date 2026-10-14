/**
 * The header's second crumb: which region the reader is inside, if any.
 *
 * decisions/207-region-breadcrumb.md
 */

export type RegionCrumb = {
  href: string;
  /** Finnish, like every user-facing string. */
  label: string;
};

/**
 * The three region roots, as the browser sees them: `usePathname()` reports
 * the public Finnish URL, not the English folder it is rewritten to.
 *
 * decisions/207-region-breadcrumb.md
 */
const REGIONS: readonly RegionCrumb[] = [
  { href: "/kotimaa", label: "Kotimaa" },
  { href: "/ulkomaat", label: "Ulkomaat" },
  { href: "/maajoukkueet", label: "Maajoukkueet" },
];

/**
 * The region crumb for a path, or `null` where there should not be one: the
 * front page, a path outside the three regions, and a region's own picker.
 *
 * decisions/207-region-breadcrumb.md
 */
export function regionCrumbFor(pathname: string): RegionCrumb | null {
  // A trailing slash is the same page, and `//` is not a different region. A
  // loop, not `/\/+$/`: that pattern backtracks over a run of slashes, which
  // is quadratic on a path made of them.
  let normalised = pathname;
  while (normalised.endsWith("/")) normalised = normalised.slice(0, -1);
  if (normalised === "") return null;

  const region = REGIONS.find(
    (candidate) => normalised === candidate.href || normalised.startsWith(`${candidate.href}/`)
  );
  if (region === undefined) return null;

  return normalised === region.href ? null : region;
}
