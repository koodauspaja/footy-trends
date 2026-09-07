/**
 * The name a signed-in reader is shown, from specs/023-google-oauth-login.md.
 *
 * Its own module rather than a closure inside `auth.ts`, so it can be tested
 * without constructing better-auth — `auth.ts` reads four environment variables
 * at import and throws without them, which is exactly what the CI unit job has
 * none of.
 *
 * `user.name` is `NOT NULL`. Google returns a name under the `profile` scope, so
 * the fallbacks below guard a contract rather than an expected path — but the
 * failure they prevent is an insert that fails at the OAuth callback, where the
 * reader sees only a generic error.
 */
export function displayNameFor(profile: {
  name?: string | null | undefined;
  email: string;
}): string {
  const name = profile.name?.trim();
  if (name) return name;

  // `split` always yields at least one element, but `noUncheckedIndexedAccess`
  // types it as possibly undefined, and an email that somehow starts with "@"
  // would genuinely give an empty local part.
  const localPart = profile.email.split("@")[0]?.trim();
  if (localPart) return localPart;

  // Last resort. `email` is guaranteed non-empty by the `email` scope, so this
  // is only reachable for an address that is nothing but "@…".
  return profile.email;
}
