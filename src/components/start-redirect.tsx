"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { defaultRegionOf } from "@/lib/session-extras";

/**
 * The query parameter that always shows the region picker, whatever is stored.
 *
 * decisions/024-account-settings.md
 */
export const SHOW_PICKER_PARAM = "valitse";

/**
 * The redirect itself: a reader with a default region goes there, unless the
 * picker was asked for.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 */
function Redirect() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const suppressed = searchParams.has(SHOW_PICKER_PARAM);

  useEffect(() => {
    if (suppressed || isPending || !session) return;

    // `defaultRegionOf` narrows what `customSession` adds: a region retired from
    // the app must not redirect anyone.
    const region = defaultRegionOf(session);
    if (region === null) return;

    // `replace`, not `push`: the front page must not become a step the reader
    // has to click past twice on the way back.
    router.replace(`/${region}`);
  }, [suppressed, isPending, session, router]);

  return null;
}

/**
 * Sends a reader with a start page there. Applied in the browser,
 * deliberately: `/` is prerendered, and reading the session on the server
 * would cost it that.
 *
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 */
export function StartRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
