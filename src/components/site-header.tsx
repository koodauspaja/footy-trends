"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthControls, AuthNotice } from "@/components/auth-controls";
import { SHOW_PICKER_PARAM } from "@/components/start-redirect";
import { useSession } from "@/lib/auth-client";
import { regionCrumbFor } from "@/lib/breadcrumb";
import { isRegionSegment } from "@/lib/regions";

/**
 * `Etusivu / Kotimaa` — the front page, then the region the reader is inside.
 *
 * A client component because the root layout renders this, and the App Router
 * exposes no server-side pathname; `usePathname()` is the supported way to
 * know where we are. The alternative was a `layout.tsx` per region passing its
 * own name down, which stays on the server but is five files and quietly loses
 * the header for any future region that forgets one.
 *
 * The second crumb is absent on `/` and on the region pickers themselves,
 * where it would point at the page already shown.
 */
export function SiteHeader() {
  const region = regionCrumbFor(usePathname());
  const { data: session } = useSession();

  /**
   * `Etusivu` has to reach the region picker, not bounce off it.
   *
   * A reader with a start-page preference is redirected away from `/`, so
   * without the suppressing parameter this crumb would return them to the
   * region they are already in and look broken. No setting may make a page
   * unreachable by clicking — see specs/024-account-settings.md.
   */
  const hasStartPage = isRegionSegment(
    (session as { defaultRegion?: unknown } | null)?.defaultRegion
  );
  const homeHref = hasStartPage ? `/?${SHOW_PICKER_PARAM}=1` : "/";

  return (
    <header className="border-zinc-200 border-b">
      {/* Wraps rather than truncates. A narrow viewport with the longest
          breadcrumb (`Maajoukkueet`) and a long Google display name overflows a
          single non-wrapping row, pushing the sign-out control off-screen. The
          repo's instinct is to wrap a long name rather than cut it — see the
          note in data-table.tsx — so the header grows to two lines instead. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
        {/* The auth control sits outside this nav, so the breadcrumb landmark
            keeps meaning "murupolku" rather than "murupolku and a login". */}
        <nav aria-label="Murupolku" className="flex min-w-0 items-center gap-2 text-sm">
          <Link className="hover:underline" href={homeHref}>
            Etusivu
          </Link>
          {region !== null && (
            <>
              <span aria-hidden="true" className="text-zinc-400">
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
      {/* Outside the flex row above: `Notice` is a full-width banner, and the
          row is a single line of breadcrumb and controls. */}
      <div className="px-4 sm:px-8">
        <AuthNotice />
      </div>
    </header>
  );
}
