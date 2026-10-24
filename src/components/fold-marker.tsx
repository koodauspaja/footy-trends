/**
 * The marker every fold's summary shows: ▸ when folded, ▾ when open, turned by
 * its own `<details>` alone, so a fold inside an open one still shows its own
 * state. `aria-hidden`: the `<details>` already says whether it is open.
 *
 * decisions/419-shared-fold-marker.md
 * decisions/071-section-toggles.md
 */
export function FoldMarker() {
  return (
    <span
      aria-hidden="true"
      className="inline-block text-muted transition-transform [details[open]>summary>&]:rotate-90"
    >
      ▸
    </span>
  );
}
