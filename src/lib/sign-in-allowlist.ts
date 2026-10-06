import { SIGN_IN_NOT_ALLOWED } from "@/lib/sign-in-refusal";

/**
 * Who may sign in, where that is restricted at all. Unset means unrestricted.
 *
 * decisions/314-sign-in-allowlist.md
 */
const VARIABLE = "AUTH_ALLOWED_EMAILS";

/**
 * The configured addresses, lower-cased, or an empty list when unrestricted.
 * Read on every call, not at module scope.
 *
 * decisions/314-sign-in-allowlist.md
 */
export function allowedSignInEmails(): string[] {
  return (process.env[VARIABLE] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

/**
 * Whether this identity is refused, given what is configured. An address is
 * required when a list is set.
 *
 * decisions/314-sign-in-allowlist.md
 */
export function refusesSignIn(email: unknown): boolean {
  const allowed = allowedSignInEmails();
  if (allowed.length === 0) return false;

  return typeof email !== "string" || !allowed.includes(email.trim().toLowerCase());
}

/**
 * better-auth's `user.validateUserInfo` answer: nothing to allow, `{ error }`
 * to refuse. It runs before `create-user`, on `link-account`, and on every
 * OAuth `sign-in`.
 *
 * decisions/314-sign-in-allowlist.md
 */
export function signInRefusal(email: unknown): { error: string } | undefined {
  return refusesSignIn(email) ? { error: SIGN_IN_NOT_ALLOWED } : undefined;
}
