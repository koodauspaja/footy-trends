import { SIGN_IN_NOT_ALLOWED } from "@/lib/sign-in-refusal";

/**
 * Who may sign in, where that is restricted at all, from #314.
 *
 * **Why this exists.** Sign-in was believed to be limited to Google's Testing
 * mode test-user list since #116. Measured on 2026-09-09, that was false:
 * Google enforces the list only for apps asking for more than `openid`, `email`
 * and `profile`, and this app asks for exactly those three. Staging accepted
 * any Google account, and nothing anywhere said otherwise.
 *
 * **Unset means unrestricted.** Production's consent screen is published and
 * open on purpose, and local development has no list either. The restriction
 * exists only where the variable is set, so an environment that says nothing
 * gets today's behaviour rather than a lockout.
 */
const VARIABLE = "AUTH_ALLOWED_EMAILS";

/**
 * The configured addresses, lower-cased, or an empty list when unrestricted.
 *
 * Read on every call rather than at module scope. This does **not** save a
 * restart on Railway, which redeploys the service whenever a variable changes —
 * an earlier version of this comment claimed it did, and that was wrong. What it
 * does is make the function honest about its input: it answers from the
 * environment as it is when asked, so nothing depends on when the module
 * happened to be imported, and a test can change the variable between cases.
 * The cost is a string split per sign-in.
 */
export function allowedSignInEmails(): string[] {
  return (process.env[VARIABLE] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

/**
 * Whether this identity is refused, given what is configured.
 *
 * An address is required when a list is set: an identity the provider gave no
 * email for cannot be checked against it, and admitting what cannot be checked
 * is the opposite of an allowlist.
 */
export function refusesSignIn(email: unknown): boolean {
  const allowed = allowedSignInEmails();
  if (allowed.length === 0) return false;

  return typeof email !== "string" || !allowed.includes(email.trim().toLowerCase());
}

/**
 * better-auth's `user.validateUserInfo` answer: nothing to allow, `{ error }`
 * to refuse.
 *
 * It runs before `create-user`, on `link-account`, and on every OAuth
 * `sign-in` — which is what makes this a restriction rather than a bouncer that
 * only checks new faces. An account created before the list existed is refused
 * on its next sign-in, and no `user` row is written for one that never got in.
 */
export function signInRefusal(email: unknown): { error: string } | undefined {
  return refusesSignIn(email) ? { error: SIGN_IN_NOT_ALLOWED } : undefined;
}
