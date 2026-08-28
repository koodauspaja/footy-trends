/**
 * The App Router's root loading state, shown while **any** page streams.
 *
 * The copy is deliberately generic. It previously read `Ladataan
 * sarjataulukkoa...` — "loading the standings table" — which is true of three
 * routes and false of the rest: the match lists, the team pages, both
 * national-team pages and every region picker render no table at all. A reader
 * on `/maajoukkueet/helmarit` was told the app was fetching something that page
 * never shows. See #179.
 *
 * Per-route loading files would allow a more specific message, but this text is
 * on screen for a few hundred milliseconds and three of them would carry the
 * same string — accuracy here is worth more than specificity.
 */
export default function Loading() {
  return <p className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">Ladataan...</p>;
}
