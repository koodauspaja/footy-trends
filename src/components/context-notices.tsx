import type { BasePageContext } from "@/lib/page-context";
import { Notice } from "./notice";

type ResolvedContext = Extract<BasePageContext, { status: "ok" }>;

/**
 * The invalid-`kilpailu` and invalid-`kausi` banners, shared by every
 * `kilpailu`/`kausi`-keyed page.
 *
 * Both the standings and match-list pages branch into a league shape and a cup
 * shape, and all four render exactly these two notices — four copies of the
 * same block if it lives in the pages. See specs/014-champions-league.md.
 */
export function ContextNotices({ resolved }: Readonly<{ resolved: ResolvedContext }>) {
  return (
    <>
      {resolved.competitionParam.kind === "invalid" && (
        <Notice>Kilpailua ei löytynyt. Näytetään {resolved.competitionName}.</Notice>
      )}
      {resolved.season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {resolved.seasonLabel}.</Notice>
      )}
    </>
  );
}
