/**
 * The name a signed-in reader is shown. `user.name` is `NOT NULL`, so the
 * fallbacks keep the insert at the OAuth callback from failing.
 *
 * decisions/023-google-oauth-login.md
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
