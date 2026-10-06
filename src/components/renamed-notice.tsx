/**
 * The muted line under a page heading saying what a competition is called now,
 * for a season it carried a different name. Renders nothing when the name has
 * not changed.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function RenamedNotice({ renamedTo }: Readonly<{ renamedTo: string | null }>) {
  if (renamedTo === null) return null;

  return <p className="-mt-4 mb-4 text-sm text-muted">nykyisin {renamedTo}</p>;
}
