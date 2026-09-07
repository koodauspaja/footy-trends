"use client";

import { usePathname } from "next/navigation";
import { signIn } from "@/lib/auth-client";

/**
 * What a signed-out reader gets at `/asetukset`: an explanation and a way in,
 * rather than a redirect or a middleware bounce. See
 * specs/024-account-settings.md.
 */
export function SignInPrompt() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col items-start gap-3">
      <p>Kirjaudu sisään nähdäksesi asetuksesi.</p>
      <button
        className="rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
        onClick={() => {
          signIn
            .social({
              provider: "google",
              // Straight back here, which is where they were trying to go.
              callbackURL: pathname,
              errorCallbackURL: "/?error=auth",
            })
            .catch(() => {
              /* The header's notice reports a failure; nothing to add here. */
            });
        }}
        type="button"
      >
        Kirjaudu sisään
      </button>
    </div>
  );
}
