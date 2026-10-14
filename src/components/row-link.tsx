import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link repeated once per row of a data list, a team in a standings table or
 * a match in a match list, which the browser does not prefetch. It navigates
 * as any link does.
 *
 * decisions/489-row-links-not-prefetched.md
 */
export function RowLink(props: Readonly<Omit<ComponentProps<typeof Link>, "prefetch">>) {
  return <Link {...props} prefetch={false} />;
}
