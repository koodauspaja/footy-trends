"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The page Next renders when the app itself has failed: in place of the root
 * layout, `<html>` and all.
 *
 * **It leans on nothing else.** No layout, no stylesheet, no component of the
 * app's own: whatever failed may be one of them. It used to render Next's
 * default error page, which is in English under `lang="en"` (#533).
 *
 * The way home is a plain link and not a `Link`: a full page load is the
 * point, since the router that would handle a client navigation belongs to
 * what just failed.
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
