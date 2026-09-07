"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { signIn, signOut, useSession } from "@/lib/auth-client";

// `shrink-0` keeps the button its full width when a long name shares the row.
const BUTTON_CLASS = "shrink-0 text-sm hover:underline";

/**
 * What went wrong, carried in the URL rather than in component state.
 *
 * Google reports its own failures by sending the reader back to
 * `errorCallbackURL`, so the query string is already the channel for one half
 * of this. Using it for the other half too means one notice with one source,
 * instead of a second, invisible mechanism that has to be kept in agreement
 * with the first.
 *
 * A `Map`, not an object literal, because the key comes straight off the query
 * string with no validation. `MESSAGES["__proto__"]` on an object returns
 * `Object.prototype`, and `constructor` and `toString` return functions — none
 * of which `??` treats as absent, so each would reach `Notice` as a non-string
 * child and throw during render. A `Map` has no inherited keys, which removes
 * the case rather than guarding against it.
 */
const MESSAGES = new Map([["signout", "Uloskirjautuminen epäonnistui. Yritä uudelleen."]]);

/** Every Google-side failure says the same thing — see `SignInError` below. */
const SIGN_IN_FAILED = "Kirjautuminen epäonnistui. Yritä uudelleen.";

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
  const router = useRouter();

  /**
   * Neither call may have its promise dropped. A rejected sign-out leaves the
   * reader looking at a header that says they are signed in while the session
   * row and cookie still exist, and an unhandled rejection is all the trace it
   * would otherwise leave. `replace`, not `push`, so the failed attempt does
   * not become a back-button step.
   */
  const report = (code: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("error", code);
    router.replace(`${pathname}?${params.toString()}`);
  };

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
        onClick={() => {
          signIn
            .social({
              provider: "google",
              // Back to the page they left, not to the front page.
              callbackURL: returnPath(pathname, searchParams),
              errorCallbackURL: "/?error=auth",
            })
            // Fails before any redirect happens — our own route being
            // unreachable, not Google refusing.
            .catch(() => report("auth"));
        }}
        type="button"
      >
        Kirjaudu sisään
      </button>
    );
  }

  return (
    <>
      {/* `min-w-0 break-words` so a long display name wraps inside the header
          instead of pushing `Kirjaudu ulos` off a narrow viewport. */}
      <span className="min-w-0 break-words text-sm text-zinc-600">{session.user.name}</span>
      <button
        className={BUTTON_CLASS}
        onClick={() => {
          signOut().catch(() => report("signout"));
        }}
        type="button"
      >
        Kirjaudu ulos
      </button>
    </>
  );
}

/**
 * The failure notice, shown after Google sends the reader back without a
 * session — a cancelled consent screen, an account that is not on the Testing
 * mode test-user list, or a provider error — and after a sign-out that failed.
 *
 * Every Google-side cause says the same thing, deliberately. Google's `error`
 * parameter tells them apart, but the reader's next action is identical in
 * every case, and naming the cause would leak whether a given account is on the
 * test-user list. Sign-out is the one distinguishable case, because it is ours
 * and describes a different thing having failed.
 */
function SignInError() {
  const error = useSearchParams().get("error");
  if (error === null) return null;

  return <Notice>{MESSAGES.get(error) ?? SIGN_IN_FAILED}</Notice>;
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
