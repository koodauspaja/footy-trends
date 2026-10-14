import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

/**
 * What a reader sees at an address nothing answers, and wherever a page calls
 * `notFound()`. It says nothing about what was asked for.
 *
 * decisions/028-admin-tools-and-roles.md
 * decisions/533-finnish-error-pages.md
 */
const HEADING = "Sivua ei löytynyt";

export const metadata: Metadata = { title: HEADING };

export default function NotFound() {
  return (
    <PageShell heading={HEADING}>
      <p>Etsimääsi sivua ei ole olemassa.</p>
      <p className="mt-4">
        <Link className="hover:underline" href="/">
          Etusivulle
        </Link>
      </p>
    </PageShell>
  );
}
