import Link from "next/link";

/**
 * The site footer, from #302.
 *
 * It exists because Google requires a **publicly reachable** privacy policy
 * before an OAuth consent screen can leave Testing, and a page nothing links to
 * is reachable only by someone who already knows the URL.
 *
 * A server component with no state, so it costs the pages it sits on nothing —
 * `tests/unit/app/rendering-mode.test.ts` keeps four of them prerendered (#182),
 * and a client component in the layout would have taken that away.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-border border-t px-4 py-6 text-muted text-sm sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
        <nav className="flex gap-4" aria-label="Sivuston tiedot">
          <Link className="hover:underline" href="/tietosuoja">
            Tietosuoja
          </Link>
          <Link className="hover:underline" href="/kayttoehdot">
            Käyttöehdot
          </Link>
        </nav>
        {/* football-data.org's free tier asks for this in "a visible section of
            your application or website", so it is on every page rather than on
            the terms page alone (#303).

            In Finnish, because CLAUDE.md admits no exceptions and their
            requirement is a *credit* rather than a fixed string: the part that
            has to survive is their name and a link to them, and both do. */}
        <p>
          Tiedot tarjoaa{" "}
          <a className="hover:underline" href="https://www.football-data.org/">
            football-data.org
          </a>
          {". Kotimaan sarjat: Suomen Palloliitto."}
        </p>
      </div>
    </footer>
  );
}
