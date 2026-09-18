/**
 * Where a sign-in sends the reader back to, shared by every control that
 * starts one: the header's button and the in-page `SignInPrompt`.
 *
 * One definition because two drifted: the prompt sent the bare pathname, which
 * was harmless on `/asetukset` and `/suosikit` but on a team page dropped
 * `?kilpailu=`/`?kausi=` — the reader signed in from a chart and came back to a
 * different competition and season (specs/030).
 */

/** The query parameter a failed sign-in is reported through. */
export const ERROR_PARAM = "error";

/**
 * The page's own path and state, without the outcome of a previous attempt.
 *
 * `error` is dropped deliberately (#266). Carrying the whole query string is
 * what returns the reader to `?kilpailu=`/`?kausi=`/`?vaihe=` where they left
 * off — but on `/?error=auth` it also made `callbackURL` point at the error
 * itself, so a *successful* sign-in landed the reader back on
 * `Kirjautuminen epäonnistui`, telling them the thing that had just worked had
 * failed. An error belongs to one attempt, not to the page.
 */
export function returnPath(pathname: string, params: URLSearchParams): string {
  const kept = new URLSearchParams(params);
  kept.delete(ERROR_PARAM);
  const query = kept.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** The same page, reporting a failed attempt through `?error=`, its state kept. */
export function withError(pathname: string, params: URLSearchParams, code: string): string {
  const reported = new URLSearchParams(params);
  reported.set(ERROR_PARAM, code);
  return `${pathname}?${reported.toString()}`;
}
