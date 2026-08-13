import type { ReactNode } from "react";

export function PageShell({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">
      <h1 className="mb-8 text-3xl font-semibold">{heading}</h1>
      {children}
    </main>
  );
}
