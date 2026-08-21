import type { ReactNode } from "react";

/**
 * The amber fallback banner shown for an invalid `kilpailu`/`kausi`/
 * `kierros` param — identical markup was repeated 3–4 times per page
 * across every standings/matches/team page (both football-data.org's and
 * `/kotimaa`'s), flagged as duplicated code. `<output>` carries the same
 * implicit "status" live-region semantics as `<p role="status">` natively,
 * without the redundant explicit role.
 */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <output className="mb-6 block rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}
    </output>
  );
}
