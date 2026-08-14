export type Competition = {
  code: string;
  name: string;
  flagUrl: string;
  /** Finnish country name, for the flag's alt text — the flag represents the country, not the league. */
  country: string;
};

/**
 * The competitions our football-data.org plan grants access to, limited to
 * plain league-table (non-cup) formats — see
 * specs/006-other-competitions.md. Flags are the competition's national
 * flag (`area.flag`), not a club/league crest: football-data.org's own
 * terms require separate consent from the clubs/leagues to use their
 * logos, which we don't have.
 */
export const DEFAULT_COMPETITION_CODE = "PL";

export const SUPPORTED_COMPETITIONS: Competition[] = [
  {
    code: "PL",
    name: "Valioliiga",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
  },
  {
    code: "ELC",
    name: "Championship",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
  },
  {
    code: "FL1",
    name: "Ligue 1",
    flagUrl: "https://crests.football-data.org/773.svg",
    country: "Ranska",
  },
  {
    code: "BL1",
    name: "Bundesliga",
    flagUrl: "https://crests.football-data.org/759.svg",
    country: "Saksa",
  },
  {
    code: "SA",
    name: "Serie A",
    flagUrl: "https://crests.football-data.org/784.svg",
    country: "Italia",
  },
  {
    code: "DED",
    name: "Eredivisie",
    flagUrl: "https://crests.football-data.org/8601.svg",
    country: "Alankomaat",
  },
  {
    code: "PPL",
    name: "Primeira Liga",
    flagUrl: "https://crests.football-data.org/765.svg",
    country: "Portugali",
  },
  {
    code: "PD",
    name: "Primera Division (LaLiga)",
    flagUrl: "https://crests.football-data.org/760.svg",
    country: "Espanja",
  },
  {
    code: "BSA",
    name: "Campeonato Brasileiro Série A",
    flagUrl: "https://crests.football-data.org/764.svg",
    country: "Brasilia",
  },
];

export type CompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * Validates the `kilpailu` query parameter against the supported
 * competition list. An unvalidated value must never reach the provider
 * URL, a cache key, or a query — same rule as `parseSeasonParam`.
 */
export function parseCompetitionParam(
  rawValue: string | string[] | undefined
): CompetitionParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string") return { kind: "invalid" };

  return SUPPORTED_COMPETITIONS.some((competition) => competition.code === rawValue)
    ? { kind: "valid", code: rawValue }
    : { kind: "invalid" };
}

export function getCompetitionName(code: string): string {
  return SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.name ?? code;
}
