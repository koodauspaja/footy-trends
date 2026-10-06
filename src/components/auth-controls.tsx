"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { Notice } from "@/components/notice";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { ERROR_PARAM, returnPath, withError } from "@/lib/return-path";
import { avatarSourceOf, isAdminSession } from "@/lib/session-extras";
import { SIGN_IN_NOT_ALLOWED } from "@/lib/sign-in-refusal";

// `shrink-0` keeps the button its full width when a long name shares the row.
const BUTTON_CLASS = "shrink-0 text-sm hover:underline";

/**
 * The notices by error code, as the URL carries it. A `Map`, because the key
 * comes off the query string unvalidated and a `Map` has no inherited keys.
 *
 * decisions/023-google-oauth-login.md
 * decisions/314-sign-in-allowlist.md
 */
const MESSAGES = new Map([
  ["signout", "Uloskirjautuminen epäonnistui. Yritä uudelleen."],
  /**
   * The one sign-in failure worth naming: trying again fails identically, so the
   * reader is told to ask for access.
   */
  [
    SIGN_IN_NOT_ALLOWED,
    "Kirjautuminen on rajoitettu tässä ympäristössä. Pyydä käyttöoikeutta ylläpidolta.",
  ],
]);

/**
 * Every Google-side failure says the same thing: see `SignInError` below.
 *
 * decisions/023-google-oauth-login.md
 */
const SIGN_IN_FAILED = "Kirjautuminen epäonnistui. Yritä uudelleen.";

/**
 * The sign-in and sign-out control. The session is read here, in the browser,
 * so the prerendered pages above it stay static.
 *
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 * decisions/266-spent-sign-in-error.md
 */
function AuthButtons() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Neither call may leave an unhandled rejection. `replace`, not `push`, so a
  // failed attempt is not a back-button step.
  const report = (code: string) => {
    router.replace(withError(pathname, searchParams, code));
  };

  // Clears a notice left by a failed sign-out, and touches the URL only when
  // there is one.
  const clearError = () => {
    if (!searchParams.has(ERROR_PARAM)) return;
    router.replace(returnPath(pathname, searchParams));
  };

  // An empty slot about the button's width, not loading text: a signed-in reader
  // must never be shown `Kirjaudu sisään`, and the header must not reflow.
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

  // `Kirjaudu ulos` lives inside the menu: the header row holds one control.
  return (
    <AccountMenu
      /* The reader's own picture first, then Google's, then their name. */
      image={avatarSourceOf(session, session.user.image ?? null)}
      // Read from the session the browser already has, like the avatar above
      // it. Not an authorisation — see `isAdminSession`.
      isAdmin={isAdminSession(session)}
      name={session.user.name}
      onSignOut={() => {
        // `then(onFulfilled, onRejected)`, so a throw inside `clearError` is not
        // reported as a failed sign-out; the terminal `catch` keeps it from escaping.
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
 * The failure notice, after a sign-in that produced no session and after a
 * sign-out that failed. Google-side causes all read the same; two are named.
 *
 * decisions/023-google-oauth-login.md
 * decisions/314-sign-in-allowlist.md
 */
function SignInError() {
  // `getAll`, not `get`: better-auth appends its own `error=<code>` to the one
  // the callback URL carries, and `get` would answer the less specific.
  const errors = useSearchParams().getAll(ERROR_PARAM);
  if (errors.length === 0) return null;

  const named = errors.find((code) => MESSAGES.has(code));
  return <Notice>{named === undefined ? SIGN_IN_FAILED : MESSAGES.get(named)}</Notice>;
}

/**
 * The controls behind a Suspense boundary, which `useSearchParams` needs for
 * the route to stay prerendered. The fallback is `null`.
 *
 * decisions/023-google-oauth-login.md
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
