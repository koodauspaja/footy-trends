"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthControls, AuthNotice } from "@/components/auth-controls";
import { SHOW_PICKER_PARAM } from "@/components/start-redirect";
import { TeamSearch } from "@/components/team-search";
import { useSession } from "@/lib/auth-client";
import { regionCrumbFor } from "@/lib/breadcrumb";
import { defaultRegionOf } from "@/lib/session-extras";

/**
 * `Etusivu / Kotimaa`: the front page, then the region the reader is inside.
 * The second crumb is absent on `/` and on the region pickers themselves.
 *
 * decisions/007-back-navigation.md
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 * decisions/207-region-breadcrumb.md
 * decisions/373-team-search-header-row.md
 */
export function SiteHeader() {
  const region = regionCrumbFor(usePathname());
  const { data: session } = useSession();

  // `Etusivu` has to reach the region picker, not bounce off it: a reader with a
  // start-page preference is redirected away from `/` without the parameter.
  const hasStartPage = defaultRegionOf(session) !== null;
  const homeHref = hasStartPage ? `/?${SHOW_PICKER_PARAM}=1` : "/";

  return (
    <header className="border-border-subtle border-b">
      {/* Wraps, not truncates: on a narrow viewport the header grows to two
          lines. Two children, so `justify-between` puts the breadcrumb at one
          end and the account control at the other. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
        {/* The auth control sits outside this nav, so the breadcrumb landmark
            keeps meaning "murupolku" rather than "murupolku and a login". */}
        <nav aria-label="Murupolku" className="flex min-w-0 items-center gap-2 text-sm">
          <Link className="hover:underline" href={homeHref}>
            Etusivu
          </Link>
          {region !== null && (
            <>
              <span aria-hidden="true" className="text-faint">
                /
              </span>
              <Link className="hover:underline" href={region.href}>
                {region.label}
              </Link>
            </>
          )}
        </nav>
        <div className="flex min-w-0 items-center gap-3">
          <AuthControls />
        </div>
      </div>
      {/* Its own row, aligned under the breadcrumb above it and carrying its
          own padding. It renders nothing for a signed-out reader. */}
      <TeamSearch />
      {/* Outside the flex row above: `Notice` is a full-width banner, and the
          row is a single line of breadcrumb and controls. */}
      <div className="px-4 sm:px-8">
        <AuthNotice />
      </div>
    </header>
  );
}
