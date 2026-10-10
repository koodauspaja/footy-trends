/**
 * The App Router's root loading state, shown while any page streams. The copy
 * is generic on purpose.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/179-generic-loading-text.md
 */
export default function Loading() {
  return <p className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">Ladataan...</p>;
}
