/**
 * Every kind of page the UX sweep reads, by a short name: one of each, with
 * the e2e stand-in's data on every one.
 *
 * decisions/695-ux-sweep.md
 */
export const UX_PAGES: ReadonlyArray<readonly [string, string]> = [
  ["front", "/"],
  ["domestic", "/kotimaa"],
  ["foreign", "/ulkomaat"],
  ["national", "/maajoukkueet"],
  ["vl-standings", "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026"],
  ["vl-2017-knockout", "/kotimaa/sarjataulukko?kausi=2017"],
  ["msc-standings", "/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025"],
  ["liigacup-standings", "/kotimaa/sarjataulukko?kilpailu=LC&kausi=2023"],
  ["pl-standings", "/ulkomaat/sarjataulukko?kilpailu=PL"],
  ["pl-2024-standings", "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024"],
  ["cl-standings", "/ulkomaat/sarjataulukko?kilpailu=CL"],
  ["wc-standings", "/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026"],
  ["vl-matches", "/kotimaa/ottelut?kilpailu=VL&kausi=2026"],
  ["foreign-matches", "/ulkomaat/ottelut"],
  ["inter-team", "/kotimaa/joukkue/60987"],
  ["arsenal-team", "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024"],
  ["arsenal-cl-team", "/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024"],
  ["huuhkajat", "/maajoukkueet/huuhkajat"],
  ["helmarit", "/maajoukkueet/helmarit"],
  ["played-match", "/kotimaa/ottelu/4036852"],
  ["upcoming-match", "/kotimaa/ottelu/4353547"],
  ["rivalry", "/kotimaa/kohtaamiset/60901/60987"],
  ["predictions", "/ennusteet"],
  ["settings", "/asetukset"],
  ["admin", "/yllapito"],
  ["privacy", "/tietosuoja"],
  ["terms", "/kayttoehdot"],
  ["not-found", "/ei-ole-olemassa"],
];

/**
 * The status a listed page answers with: the 404 page 404, and every other
 * page 200. The admin page shows a not-found page to anyone but an admin, still
 * with 200, because its response streams before `notFound()` runs.
 *
 * decisions/028-admin-tools-and-roles.md
 * decisions/695-ux-sweep.md
 */
export function expectedStatus(name: string): number {
  return name === "not-found" ? 404 : 200;
}
