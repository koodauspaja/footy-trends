"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { regionCrumbFor } from "@/lib/breadcrumb";

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

  return (
    <header className="border-zinc-200 border-b px-4 py-3 sm:px-8">
      <nav aria-label="Murupolku" className="flex items-center gap-2 text-sm">
        <Link className="hover:underline" href="/">
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
    </header>
  );
}
