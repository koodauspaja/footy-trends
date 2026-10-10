/**
 * The marker every fold's summary shows: ▸ when folded, ▾ when open, so a
 * heading reads as something to press. Pure CSS, and `aria-hidden`: the
 * `<details>` already says whether it is open.
 *
 * decisions/419-shared-fold-marker.md
 */
export function FoldMarker() {
  return (
    <span
      aria-hidden="true"
      className="inline-block text-muted transition-transform group-open:rotate-90"
    >
      ▸
    </span>
  );
}
