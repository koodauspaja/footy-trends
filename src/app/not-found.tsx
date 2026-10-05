import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

/**
 * What a reader sees at an address nothing answers, and wherever a page calls
 * `notFound()`. Next's own default is in English (#533).
 *
 * **It says nothing about what was asked for.** The admin area answers a reader
 * it does not know with `notFound()`, so that the page is indistinguishable
 * from one that does not exist (specs/028). One wording for every case is what
 * keeps that true.
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
