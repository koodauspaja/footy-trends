import { Notice } from "./notice";

/**
 * What the notices need, which is less than any page's whole context: the two
 * parameter verdicts and what is being shown instead.
 *
 * Widened from `BasePageContext` so `/kotimaa`'s pages, whose context is a
 * different type with the same three fields, stop carrying their own copy of
 * this markup. See specs/022-teams-between-tiers.md.
 */
export type NoticeContext = {
  competitionParam: { kind: "absent" | "valid" | "invalid" };
  competitionName: string;
  season: { kind: "absent" | "valid" | "invalid" };
  seasonLabel: string;
};

/**
 * The invalid-`kilpailu` and invalid-`kausi` banners, shared by every
 * `kilpailu`/`kausi`-keyed page.
 *
 * Both the standings and match-list pages branch into a league shape and a cup
 * shape, and all four render exactly these two notices — four copies of the
 * same block if it lives in the pages. See specs/014-champions-league.md.
 */
export function ContextNotices({ resolved }: Readonly<{ resolved: NoticeContext }>) {
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
