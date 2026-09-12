"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { Notice } from "@/components/notice";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { avatarSourceOf, isAdminSession } from "@/lib/session-extras";
import { SIGN_IN_NOT_ALLOWED } from "@/lib/sign-in-refusal";

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
const MESSAGES = new Map([
  ["signout", "Uloskirjautuminen epäonnistui. Yritä uudelleen."],
  /**
   * The one sign-in failure worth naming, from #314. Every other cause says
   * `SIGN_IN_FAILED` because the reader's next move is the same — try again.
   * Here it is not: trying again will fail identically forever, and the reader
   * has to ask for access instead. Telling them to retry would be false.
   */
  [
    SIGN_IN_NOT_ALLOWED,
    "Kirjautuminen on rajoitettu tässä ympäristössä. Pyydä käyttöoikeutta ylläpidolta.",
  ],
]);

/** Every Google-side failure says the same thing — see `SignInError` below. */
const SIGN_IN_FAILED = "Kirjautuminen epäonnistui. Yritä uudelleen.";

const ERROR_PARAM = "error";

/**
 * Where to send the reader back to, carrying the page's own state but not the
 * outcome of a previous attempt.
 *
 * `error` is dropped deliberately (#266). Carrying the whole query string is
 * what returns the reader to `?kilpailu=`/`?kausi=`/`?vaihe=` where they left
 * off — but on `/?error=auth` it also made `callbackURL` point at the error
 * itself, so a *successful* sign-in landed the reader back on
 * `Kirjautuminen epäonnistui`, telling them the thing that had just worked had
 * failed. An error belongs to one attempt, not to the page.
 */
function returnPath(pathname: string, params: URLSearchParams): string {
  const kept = new URLSearchParams(params);
  kept.delete(ERROR_PARAM);
  const query = kept.toString();
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
   * Neither call may leave an unhandled rejection. A rejected sign-out leaves
   * the reader looking at a header that says they are signed in while the
   * session row and cookie still exist, and an unhandled rejection is all the
   * trace it would otherwise leave. `replace`, not `push`, so the failed
   * attempt does not become a back-button step.
   */
  const report = (code: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(ERROR_PARAM, code);
    router.replace(`${pathname}?${params.toString()}`);
  };

  /**
   * Sign-out succeeds without navigating, so a notice left over from a failed
   * one would stay on screen (#266). Only touches the URL when there is
   * something to clear, so the ordinary path adds no history entry.
   */
  const clearError = () => {
    if (!searchParams.has(ERROR_PARAM)) return;
    router.replace(returnPath(pathname, searchParams));
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

  // `Kirjaudu ulos` lives inside the menu as of specs/024-account-settings.md.
  // The header row holds one control instead of three, which is what overflowed
  // a 320px viewport in #266.
  return (
    <AccountMenu
      /**
       * The reader's own picture first, then Google's, then their name —
       * extending by one the fallback chain specs/024 established
       * (specs/025-custom-avatar.md). The version rides on the session the
       * browser already fetches, so this costs no extra request.
       */
      image={avatarSourceOf(session, session.user.image ?? null)}
      // Read from the session the browser already has, like the avatar above
      // it. Not an authorisation — see `isAdminSession`.
      isAdmin={isAdminSession(session)}
      name={session.user.name}
      onSignOut={() => {
        // `then(onFulfilled, onRejected)` rather than `.then().catch()`, so a
        // throw inside `clearError` is not reported as a failed sign-out — and
        // a terminal `catch` so that throw cannot escape either. All
        // `clearError` does is rewrite the URL; if that fails the notice simply
        // stays put, which is worth swallowing but not worth mislabelling.
        signOut()
          .then(clearError, () => report("signout"))
          .catch(() => {
            /* The URL rewrite failed; the stale notice stays. Nothing to say. */
          });
      }}
    />
  );
}

/**
 * The failure notice, shown after a sign-in that produced no session and after
 * a sign-out that failed.
 *
 * **Google-side causes all say the same thing, deliberately** — a cancelled
 * consent screen, a provider error, a state that did not survive. Google's
 * `error` parameter tells them apart, but the reader's next action is identical
 * in every case: try again.
 *
 * Two causes are named, because for them that advice would be wrong:
 *
 * - **The allowlist refused it** (#314). Ours, not Google's: the reader got
 *   through Google and this app turned them away. Retrying fails identically
 *   forever, so the notice says to ask for access. It names the environment
 *   rather than the address, so it reveals nothing about who is on the list.
 * - **Sign-out failed.** Also ours, and a different thing having failed.
 *
 * This comment previously said naming a cause would leak whether an account was
 * on Google's Testing mode test-user list. #314 measured that premise away: that
 * list never gated this app, because Google enforces it only beyond
 * `openid`/`email`/`profile`.
 */
function SignInError() {
  /**
   * `getAll`, not `get`, and this is load-bearing rather than defensive.
   *
   * `errorCallbackURL` already carries `?error=auth`, and better-auth's
   * `appendQueryParams` **concatenates** its own `error=<code>` rather than
   * replacing it — so the reader lands on `/?error=auth&error=<code>` and
   * `get("error")` answers `"auth"`, the least specific of the two. A named
   * cause would have been silently unreachable.
   */
  const errors = useSearchParams().getAll("error");
  if (errors.length === 0) return null;

  const named = errors.find((code) => MESSAGES.has(code));
  return <Notice>{named === undefined ? SIGN_IN_FAILED : MESSAGES.get(named)}</Notice>;
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
