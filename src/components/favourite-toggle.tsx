"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "@/lib/auth-client";
import {
  toggleFavouriteCompetitionAction,
  toggleFavouriteTeamAction,
} from "@/lib/favourite-actions";
import { competitionKey, type FavouriteSource, teamKey } from "@/lib/favourite-keys";
import type { RegionSegment } from "@/lib/regions";
import { reportClientError } from "@/lib/report-client-error";
import { favouriteKeysOf } from "@/lib/session-extras";

/**
 * The one control for favouriting anything, on every surface. A client
 * component reading the session the browser already has. A unit test that
 * renders anything containing it mocks `@/lib/auth-client`, or runs the real
 * client's cleanup as `session-hydration.test.tsx` does.
 *
 * decisions/026-favourites.md
 * decisions/535-session-read-needs-no-hydration-wait.md
 */

type Props = Readonly<
  { className?: string } & (
    | { kind: "team"; source: FavouriteSource; teamProviderId: number; name: string }
    | { kind: "competition"; region: RegionSegment; code: string; name: string }
  )
>;

const LABEL_ADD = "Lisää suosikkeihin";
const LABEL_REMOVE = "Poista suosikeista";

/**
 * At the cap. The reader has to remove one, so the notice has to say which limit.
 *
 * decisions/026-favourites.md
 */
const LIMIT_NOTICE = "Suosikkeja voi olla enintään 50.";

export function FavouriteToggle(props: Props) {
  const { data: session, refetch } = useSession();
  const [pending, startTransition] = useTransition();
  // `null` means no answer of our own yet: use the session.
  const [own, setOwn] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(false);

  const key =
    props.kind === "team"
      ? teamKey(props.source, props.teamProviderId)
      : competitionKey(props.region, props.code);

  // Computed before the early return below, because the effect that follows is a
  // hook. A null session answers `[]`.
  const stored = favouriteKeysOf(session, props.kind).includes(key);

  // Hand the state back to the session the moment the two agree, and not before.
  useEffect(() => {
    if (own !== null && own === stored) setOwn(null);
  }, [own, stored]);

  // Safe on the first render: better-auth hydrates with the signed-out state the
  // server rendered, and answers with a session it already holds only after that.
  if (!session) return null;

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
                // The write is not finished until the session catches up: other stars on the
                // page read the same payload.
                await refetch();
              } else if (result.reason === "limit") {
                setLimit(true);
              }
              // A failure leaves the star where it was: reporting the old state
              // is honest, and the reader can press again.
            } catch (error) {
              // To the reader, a rejected invocation is the same as a refused one.
              reportClientError(error, "favourite.toggle");
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
