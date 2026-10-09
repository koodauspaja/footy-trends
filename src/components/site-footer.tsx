import Link from "next/link";

/**
 * The site footer: links to the privacy policy and the terms, and the data
 * providers' credit. A server component with no state.
 *
 * decisions/302-privacy-policy-and-footer.md
 * decisions/303-terms-and-attribution.md
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
        {/* football-data.org asks for this in "a visible section", so it is on
            every page. In Finnish: what has to survive is their name and a link. */}
        {/* A joint credit, not a split one: the precise split is on
            `/kayttoehdot`, where there is room for it. */}
        <p>
          Tiedot tarjoaa{" "}
          <a className="hover:underline" href="https://www.football-data.org/">
            football-data.org
          </a>
          {" ja Suomen Palloliitto."}
        </p>
      </div>
    </footer>
  );
}
