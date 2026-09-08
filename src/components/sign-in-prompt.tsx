"use client";

import { usePathname, useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

/**
 * What a signed-out reader gets at `/asetukset`: an explanation and a way in,
 * rather than a redirect or a middleware bounce. See
 * specs/024-account-settings.md.
 */
export function SignInPrompt() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-3">
      <p>Kirjaudu sisään nähdäksesi asetuksesi.</p>
      <button
        className="rounded border border-border px-3 py-2 text-sm hover:bg-surface"
        onClick={() => {
          signIn
            .social({
              provider: "google",
              // Straight back here, which is where they were trying to go.
              callbackURL: pathname,
              errorCallbackURL: "/?error=auth",
            })
            /**
             * Reported through the same `?error=` channel Google's own
             * failures use, so the header's notice renders it — one mechanism,
             * one source. An earlier version swallowed this and claimed the
             * header would report it; the header only reports *its own*
             * sign-in call, so the reader was left with a button that appeared
             * to do nothing.
             */
            .catch(() => router.replace(`${pathname}?error=auth`));
        }}
        type="button"
      >
        Kirjaudu sisään
      </button>
    </div>
  );
}
