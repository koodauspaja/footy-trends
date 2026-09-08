"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { defaultRegionOf } from "@/lib/session-extras";

/**
 * The query parameter that always shows the region picker, whatever is stored.
 *
 * This is what makes the redirect safe to have at all. Without it a reader with
 * a default region could reach `/` only by having no preference — the picker
 * would be unreachable by clicking, and the `Etusivu` crumb would bounce them
 * straight back where they came from. No setting in
 * specs/024-account-settings.md may make a page unreachable.
 */
export const SHOW_PICKER_PARAM = "valitse";

function Redirect() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const suppressed = searchParams.has(SHOW_PICKER_PARAM);

  useEffect(() => {
    if (suppressed || isPending || !session) return;

    /**
     * `defaultRegion` is added to the session response by better-auth's
     * `customSession` plugin (see src/lib/auth.ts), and the browser client is
     * not typed for server-side plugins — `defaultRegionOf` does the narrowing,
     * which is the check we would want regardless, since a region retired from
     * the app must not redirect anyone.
     */
    const region = defaultRegionOf(session);
    if (region === null) return;

    // `replace`, not `push`: the front page must not become a step the reader
    // has to click past twice on the way back.
    router.replace(`/${region}`);
  }, [suppressed, isPending, session, router]);

  return null;
}

/**
 * Applied in the browser, deliberately.
 *
 * `/` is one of the four pages `tests/unit/app/rendering-mode.test.ts` names
 * `STATIC_BY_DESIGN`. Reading the session on the server here would cost it its
 * prerender — the #182 constraint that shaped specs/023-google-oauth-login.md,
 * where a prerendered page baked a build-time database error into static
 * output. So the page ships static and the redirect happens after hydration.
 *
 * The competition defaults are resolved server-side instead, because those
 * pages are already `force-dynamic` and lose nothing by it.
 */
export function StartRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
