/**
 * Which page shape a competition uses.
 *
 * `league` is a single table over the whole season. `cup` has phases: a
 * league or group phase that still produces tables, followed by knockout
 * rounds that do not. The discriminator lives here rather than being derived
 * from the code so a second cup needs a registry entry, not a new branch —
 * see specs/014-champions-league.md.
 */
export type CompetitionFormat = "league" | "cup";

export type Competition = {
  code: string;
  name: string;
  flagUrl: string;
  /** Finnish country name, for the flag's alt text — the flag represents the country, not the league. */
  country: string;
  format: CompetitionFormat;
};

/**
 * The competitions our football-data.org plan grants access to. Originally
 * limited to plain league-table formats (specs/006-other-competitions.md);
 * `CL` joined as the first cup in specs/014-champions-league.md, which is why
 * every entry now carries an explicit `format`.
 *
 * Flags are the competition's national flag (`area.flag`), not a club/league
 * crest: football-data.org's own terms require separate consent from the
 * clubs/leagues to use their logos, which we don't have. Champions League
 * uses the Europe area flag for the same reason.
 */
export const DEFAULT_COMPETITION_CODE = "PL";

export const SUPPORTED_COMPETITIONS: Competition[] = [
  {
    code: "PL",
    name: "Valioliiga",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
    format: "league",
  },
  {
    code: "ELC",
    name: "Championship",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
    format: "league",
  },
  {
    code: "FL1",
    name: "Ligue 1",
    flagUrl: "https://crests.football-data.org/773.svg",
    country: "Ranska",
    format: "league",
  },
  {
    code: "BL1",
    name: "Bundesliga",
    flagUrl: "https://crests.football-data.org/759.svg",
    country: "Saksa",
    format: "league",
  },
  {
    code: "SA",
    name: "Serie A",
    flagUrl: "https://crests.football-data.org/784.svg",
    country: "Italia",
    format: "league",
  },
  {
    code: "DED",
    name: "Eredivisie",
    flagUrl: "https://crests.football-data.org/8601.svg",
    country: "Alankomaat",
    format: "league",
  },
  {
    code: "PPL",
    name: "Primeira Liga",
    flagUrl: "https://crests.football-data.org/765.svg",
    country: "Portugali",
    format: "league",
  },
  {
    code: "PD",
    name: "Primera Division (LaLiga)",
    flagUrl: "https://crests.football-data.org/760.svg",
    country: "Espanja",
    format: "league",
  },
  {
    code: "BSA",
    name: "Campeonato Brasileiro Série A",
    flagUrl: "https://crests.football-data.org/764.svg",
    country: "Brasilia",
    format: "league",
  },
  {
    code: "CL",
    name: "Mestarien liiga",
    flagUrl: "https://crests.football-data.org/EUR.svg",
    country: "Eurooppa",
    format: "cup",
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

/**
 * An unknown code answers `"league"`: the league path is the one that has
 * always existed, so a bad `kilpailu` value cannot route a request into the
 * newer cup rendering. `parseCompetitionParam` rejects unknown codes before
 * this is reached in practice.
 */
export function getCompetitionFormat(code: string): CompetitionFormat {
  return (
    SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.format ?? "league"
  );
}

export function isCupCompetition(code: string): boolean {
  return getCompetitionFormat(code) === "cup";
}
