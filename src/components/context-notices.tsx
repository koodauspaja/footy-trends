import { Notice } from "./notice";

/**
 * What the notices need, which is less than any page's whole context: the two
 * parameter verdicts and what is being shown instead.
 *
 * decisions/014-champions-league.md
 * decisions/022-teams-between-tiers.md
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
 * decisions/014-champions-league.md
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
