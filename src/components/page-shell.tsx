import type { ReactNode } from "react";

export function PageShell({
  heading,
  headingAction,
  children,
}: Readonly<{ heading: string; headingAction?: ReactNode; children: ReactNode }>) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">
      {/* The action sits beside the heading rather than under it, so a page
          about one thing offers the control for that thing in one place. */}
      <div className="mb-8 flex items-baseline gap-2">
        <h1 className="text-3xl font-semibold">{heading}</h1>
        {headingAction}
      </div>
      {children}
    </main>
  );
}
