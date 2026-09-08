"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "@/lib/auth-client";
import {
  toggleFavouriteCompetitionAction,
  toggleFavouriteTeamAction,
} from "@/lib/favourite-actions";
import { competitionKey, type FavouriteSource, teamKey } from "@/lib/favourite-keys";
import type { RegionSegment } from "@/lib/regions";
import { favouriteKeysOf } from "@/lib/session-extras";

/**
 * The one control for favouriting anything, from specs/026-favourites.md.
 *
 * **One component, not one per surface.** It renders in a standings row, on a
 * team page, on a competition page and in the region picker — and the picker
 * lives on the four pages `tests/unit/app/rendering-mode.test.ts` keeps
 * prerendered (#182). A server-rendered variant would cost those pages their
 * prerendering, so this reads the session the browser already has and there is
 * nothing to keep in step between two versions.
 *
 * It imports `favourite-keys.ts` rather than `favourites.ts`: the latter
 * reaches the database, and this is a client bundle — the same boundary
 * `avatar-limits.ts` exists for, learned the expensive way in #268.
 *
 * **A unit test that renders a tree containing this must mock
 * `@/lib/auth-client`.** The real client opens a broadcast channel whose
 * nanostores cleanup runs a second after the last unsubscribe, by which point
 * the file's jsdom is gone — it then throws `window is not defined` as an
 * uncaught exception inside whichever file is running at the time, which is a
 * flake with no relation to the file that caused it. The eight files that
 * render a standings table or a region picker already do this.
 */

type Props = Readonly<
  { className?: string } & (
    | { kind: "team"; source: FavouriteSource; teamProviderId: number; name: string }
    | { kind: "competition"; region: RegionSegment; code: string; name: string }
  )
>;

const LABEL_ADD = "Lisää suosikkeihin";
const LABEL_REMOVE = "Poista suosikeista";

/** At the cap. The reader has to remove one, so the notice has to say which limit. */
const LIMIT_NOTICE = "Suosikkeja voi olla enintään 50.";

export function FavouriteToggle(props: Props) {
  const { data: session, refetch } = useSession();
  const [pending, startTransition] = useTransition();
  /**
   * `null` means "no answer of our own yet, use the session".
   *
   * The session is refetched after a write, but not instantly, and a star that
   * springs back for a moment reads as a failure. Local state answers until the
   * session catches up, and the session is the truth on every other render.
   */
  const [own, setOwn] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(false);
  /**
   * Rendered only after hydration, and this is not cosmetic.
   *
   * Every page this appears on is server-rendered — four of them prerendered
   * (#182) — where there is no session and the star is nothing. better-auth's
   * client can answer from its own cache on the *first* client render, which
   * would then disagree with that HTML: a real hydration mismatch, which React
   * reports and recovers from by throwing the server's markup away.
   *
   * `isPending` is not enough on its own for the same reason — a cached
   * session is not pending. Mounting is the only state that is false during
   * server rendering by construction.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !session) return null;

  const key =
    props.kind === "team"
      ? teamKey(props.source, props.teamProviderId)
      : competitionKey(props.region, props.code);

  const stored = favouriteKeysOf(session, props.kind).includes(key);
  const favourite = own ?? stored;

  return (
    <>
      <button
        aria-busy={pending}
        aria-label={`${favourite ? LABEL_REMOVE : LABEL_ADD}: ${props.name}`}
        aria-pressed={favourite}
        className={`shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
        disabled={pending}
        onClick={() => {
          setLimit(false);
          startTransition(async () => {
            try {
              const result =
                props.kind === "team"
                  ? await toggleFavouriteTeamAction(props.source, props.teamProviderId)
                  : await toggleFavouriteCompetitionAction(props.region, props.code);

              if (result.ok) {
                setOwn(result.favorite);
                // The other stars on this page read the same session payload —
                // a competition can be favourited from the picker and shown
                // again on its own page — so the write is not finished until
                // the session catches up. `own` covers the gap until it does.
                await refetch();
              } else if (result.reason === "limit") {
                setLimit(true);
              }
              // A failure leaves the star where it was: reporting the old state
              // is honest, and the reader can press again.
            } catch {
              /* A rejected invocation is the same as a refused one here. */
            }
          });
        }}
        type="button"
      >
        {/* The star carries the state for a sighted reader; the `aria-label`
            carries it for everyone else, and names the thing, because a
            standings row has twenty identical buttons otherwise. */}
        <span aria-hidden="true">{favourite ? "★" : "☆"}</span>
      </button>
      {limit && <span className="ml-1 text-muted text-xs">{LIMIT_NOTICE}</span>}
    </>
  );
}
