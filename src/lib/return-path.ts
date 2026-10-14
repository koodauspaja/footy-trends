/**
 * Where a sign-in sends the reader back to, shared by every control that
 * starts one: the header's button and the in-page `SignInPrompt`.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/266-spent-sign-in-error.md
 */

/**
 * The query parameter a failed sign-in is reported through.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const ERROR_PARAM = "error";

/**
 * The page's own path and state, without the outcome of a previous attempt:
 * `error` is dropped, and every other parameter is carried.
 *
 * decisions/023-google-oauth-login.md
 * decisions/030-league-position-by-matchday.md
 * decisions/266-spent-sign-in-error.md
 */
export function returnPath(pathname: string, params: URLSearchParams): string {
  const kept = new URLSearchParams(params);
  kept.delete(ERROR_PARAM);
  const query = kept.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The same page, reporting a failed attempt through `?error=`, its state kept.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function withError(pathname: string, params: URLSearchParams, code: string): string {
  const reported = new URLSearchParams(params);
  reported.set(ERROR_PARAM, code);
  return `${pathname}?${reported.toString()}`;
}
