/**
 * The code a refused sign-in carries back in the query string. Its own
 * module, as a client component reads it; a code and not a message, since the
 * Finnish is chosen in the component.
 *
 * decisions/314-sign-in-allowlist.md
 */
export const SIGN_IN_NOT_ALLOWED = "sign_in_not_allowed";
