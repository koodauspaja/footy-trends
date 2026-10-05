import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link to the page it is on, with other search params: a switch, a pager, a
 * step to the next round. Never prefetched, because a production build
 * otherwise changes the URL and leaves the page as it was.
 * `decisions/189-same-route-links.md`
 */
export function SameRouteLink(props: Readonly<Omit<ComponentProps<typeof Link>, "prefetch">>) {
  return <Link {...props} prefetch={false} />;
}
