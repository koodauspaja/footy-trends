"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The page Next renders when the app itself has failed, in place of the root
 * layout. It leans on nothing of the app's own, and the way home is a plain
 * link, not a `Link`, so it is a full page load.
 *
 * decisions/533-finnish-error-pages.md
 */
export default function GlobalError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    // `colorScheme` so a reader in dark mode is not handed a white page: the
    // app's stylesheet, which would have decided it, is not loaded here.
    <html lang="fi" style={{ colorScheme: "light dark" }}>
      <body>
        <main
          style={{
            fontFamily: "system-ui, sans-serif",
            margin: "0 auto",
            maxWidth: "40rem",
            padding: "3rem 1rem",
          }}
        >
          <h1>Jokin meni vikaan</h1>
          <p>Sivun lataaminen epäonnistui. Yritä hetken kuluttua uudelleen.</p>
          <p>
            <a href="/">Etusivulle</a>
          </p>
        </main>
      </body>
    </html>
  );
}
