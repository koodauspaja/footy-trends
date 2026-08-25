/**
 * The muted line under a page heading saying what a competition is called now,
 * for a season it carried a different name — "Naisten Liiga 2016" with
 * "nykyisin Briotech Kansallinen Liiga" beneath it.
 *
 * Shared by all three `/kotimaa` pages rather than living on the standings
 * page alone: each of them heads with the season's own name, so each of them
 * owes the reader the same explanation. Renders nothing when the name has not
 * changed, so a caller can pass `renamedTo` through unconditionally.
 *
 * See specs/013-more-finnish-competitions.md.
 */
export function RenamedNotice({ renamedTo }: Readonly<{ renamedTo: string | null }>) {
  if (renamedTo === null) return null;

  return <p className="-mt-4 mb-4 text-sm text-zinc-500">nykyisin {renamedTo}</p>;
}
