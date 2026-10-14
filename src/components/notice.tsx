import type { ReactNode } from "react";

/**
 * The amber fallback banner shown for an invalid `kilpailu`, `kausi` or
 * `kierros` parameter. An `<output>`, which is a status live region natively.
 *
 * decisions/009-veikkausliiga.md
 */
export function Notice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <output className="mb-6 block rounded border border-notice-border bg-notice-background px-3 py-2 text-sm text-notice-foreground">
      {children}
    </output>
  );
}
