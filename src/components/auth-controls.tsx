"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, signOut, useSession } from "@/lib/auth-client";

const BUTTON_CLASS = "text-sm hover:underline";

/**
 * Where Google should send the reader back to. Relative by design: better-auth
 * validates `callbackURL` against its trusted origins, and a relative path
 * cannot become an open redirect.
 */
function returnPath(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The sign-in / sign-out control, from specs/023-google-oauth-login.md.
 *
 * The session is read here, in the browser, rather than in the root layout.
 * That is the whole design: a server-side read would put a Postgres query above
 * `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet`, the four pages
 * `tests/unit/app/rendering-mode.test.ts` names `STATIC_BY_DESIGN`. That guard
 * exists because #182 prerendered a data-backed page, every query failed at
 * build time against Railway's runtime-only private network, and the error
 * state was baked into the static output while the build exited 0.
 */
function AuthButtons() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Not "loading" text and not a spinner: an empty slot roughly the width of
  // the button that replaces it. A signed-in reader must never be shown
  // `Kirjaudu sisään` — a wrong state is worse than an absent one — and a
  // reserved width keeps the header from reflowing when the session lands.
  if (isPending) {
    return <span aria-hidden="true" className="inline-block w-[7.5rem]" />;
  }

  if (!session) {
    return (
      <button
        className={BUTTON_CLASS}
        onClick={() =>
          signIn.social({
            provider: "google",
            // Back to the page they left, not to the front page.
            callbackURL: returnPath(pathname, searchParams),
            errorCallbackURL: "/?error=auth",
          })
        }
        type="button"
      >
        Kirjaudu sisään
      </button>
    );
  }

  return (
    <>
      <span className="text-sm text-zinc-600">{session.user.name}</span>
      <button className={BUTTON_CLASS} onClick={() => signOut()} type="button">
        Kirjaudu ulos
      </button>
    </>
  );
}

/**
 * The failure notice, shown after Google sends the reader back without a
 * session — a cancelled consent screen, an account that is not on the Testing
 * mode test-user list, or a provider error.
 *
 * Deliberately one string for all three. Google's `error` parameter tells them
 * apart, but the reader's next action is the same in every case, and naming the
 * cause would leak whether a given account is on the test-user list.
 *
 * `<output>` carries the same implicit live-region semantics as
 * `<p role="status">`, matching `Notice` in components/notice.tsx.
 */
function SignInError() {
  if (!useSearchParams().has("error")) return null;

  return (
    <output className="block px-4 pb-3 text-amber-900 text-sm sm:px-8">
      Kirjautuminen epäonnistui. Yritä uudelleen.
    </output>
  );
}

/**
 * Both halves read `useSearchParams`, which without a Suspense boundary opts
 * the whole route out of prerendering — exactly what this component exists to
 * avoid. The fallback is `null` rather than a placeholder: on the four
 * prerendered pages this is what ships in the static HTML.
 */
export function AuthControls() {
  return (
    <Suspense fallback={null}>
      <AuthButtons />
    </Suspense>
  );
}

export function AuthNotice() {
  return (
    <Suspense fallback={null}>
      <SignInError />
    </Suspense>
  );
}
