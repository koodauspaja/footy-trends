/**
 * The marker every fold's summary shows: ▸ when folded, turning to ▾ when open,
 * so a heading reads as something to press (#416, #419). Without it a fold
 * shows only a pointer cursor, which a phone never shows at all.
 *
 * Pure CSS: its `<details>` carries `group`, and `group-open` turns it. It is
 * `aria-hidden`, because the `<details>` element already tells a screen reader
 * whether it is open.
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
