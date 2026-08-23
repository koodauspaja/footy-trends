export type DomesticCompetition = {
  code: string;
  name: string;
};

/**
 * Finnish competitions, shown on the `/kotimaa` picker — separate from
 * `competitions.ts`'s `SUPPORTED_COMPETITIONS` (the football-data.org list
 * behind `/ulkomaat/sarjataulukko`'s `kilpailu=`), per specs/009-veikkausliiga.md:
 * this list is never added to that one. Only Veikkausliiga today; other
 * Finnish competitions (Ykkösliiga, Suomen Cup, ...) are explicit future
 * work, not built here.
 */
export const DEFAULT_DOMESTIC_COMPETITION_CODE = "VL";

export const DOMESTIC_COMPETITIONS: DomesticCompetition[] = [{ code: "VL", name: "Veikkausliiga" }];

export function getDomesticCompetitionName(code: string): string {
  return DOMESTIC_COMPETITIONS.find((competition) => competition.code === code)?.name ?? code;
}

export type DomesticCompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * Validates the `kilpailu` query parameter against the Finnish competition
 * list — same rule as `parseCompetitionParam` in `competitions.ts`. Only
 * one valid value exists today, but the param is still validated (not
 * hardcoded away) so a second Finnish competition needs no page changes.
 */
export function parseDomesticCompetitionParam(
  rawValue: string | string[] | undefined
): DomesticCompetitionParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string") return { kind: "invalid" };

  return DOMESTIC_COMPETITIONS.some((competition) => competition.code === rawValue)
    ? { kind: "valid", code: rawValue }
    : { kind: "invalid" };
}
