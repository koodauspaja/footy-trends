import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link repeated once per row of a data list — a team in a standings table, a
 * match in a match list — which the browser does **not** prefetch (#489).
 *
 * In a production build `<Link>` prefetches every link that scrolls into view.
 * Each prefetch is small — the root `loading.tsx` stops it at the shell — but
 * it still renders the shared layout, which reads the database, and a list
 * page has dozens of such links. Measured on a production build: a standings
 * page made 45 prefetches and doubled its database work per view (40
 * transactions against 19 with prefetching blocked), for pages a reader mostly
 * never opens.
 *
 * Navigation — the header, the footer, breadcrumbs, the competition picker,
 * single links to another page — keeps Next's default, where prefetching earns
 * its cost. A row link still navigates exactly as before; it only stops
 * fetching ahead.
 */
export function RowLink(props: Readonly<Omit<ComponentProps<typeof Link>, "prefetch">>) {
  return <Link {...props} prefetch={false} />;
}
