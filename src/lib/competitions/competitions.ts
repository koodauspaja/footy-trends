/**
 * Which page shape a competition uses. `league` is one table over the whole
 * season; `cup` has a table phase followed by knockout rounds.
 *
 * decisions/014-champions-league.md
 */
export type CompetitionFormat = "league" | "cup";

/**
 * Which section of the site a competition belongs to: `/ulkomaat` for the
 * foreign leagues and the Champions League, `/maajoukkueet` for national teams.
 *
 * decisions/016-world-cup-and-euro.md
 */
export type CompetitionRegion = "foreign" | "national-teams";

/**
 * One football-data competition as the registry holds it.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/006-other-competitions.md
 * decisions/014-champions-league.md
 * decisions/016-world-cup-and-euro.md
 */
export type Competition = {
  code: string;
  name: string;
  /**
   * The area's flag, or a local asset where the provider has none. Never a club
   * or competition emblem.
   */
  flagUrl: string;
  /** Finnish country name, for the flag's alt text — the flag represents the country, not the league. */
  country: string;
  format: CompetitionFormat;
  region: CompetitionRegion;
  /**
   * The oldest season this competition can be asked for, when later than the
   * plan-wide floor. Omitted means the plan-wide floor.
   */
  earliestSeason?: number;
};

/**
 * The competition `/ulkomaat` falls back to.
 *
 * decisions/006-other-competitions.md
 */
export const DEFAULT_COMPETITION_CODE = "PL";

/**
 * The competition a region falls back to when `kilpailu` is absent or invalid.
 *
 * decisions/016-world-cup-and-euro.md
 */
const REGION_DEFAULTS: Record<CompetitionRegion, string> = {
  foreign: DEFAULT_COMPETITION_CODE,
  "national-teams": "WC",
};

export function defaultCompetitionFor(region: CompetitionRegion): string {
  return REGION_DEFAULTS[region];
}

/**
 * The competitions the football-data.org plan grants access to. Each flag is
 * the area's, or a federation's wordmark; never a club or league crest.
 *
 * decisions/006-other-competitions.md
 * decisions/014-champions-league.md
 * decisions/016-world-cup-and-euro.md
 */
export const SUPPORTED_COMPETITIONS: Competition[] = [
  {
    code: "PL",
    name: "Valioliiga",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
    format: "league",
    region: "foreign",
  },
  {
    code: "ELC",
    name: "Championship",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
    format: "league",
    region: "foreign",
  },
  {
    code: "FL1",
    name: "Ligue 1",
    flagUrl: "https://crests.football-data.org/773.svg",
    country: "Ranska",
    format: "league",
    region: "foreign",
  },
  {
    code: "BL1",
    name: "Bundesliga",
    flagUrl: "https://crests.football-data.org/759.svg",
    country: "Saksa",
    format: "league",
    region: "foreign",
  },
  {
    code: "SA",
    name: "Serie A",
    flagUrl: "https://crests.football-data.org/784.svg",
    country: "Italia",
    format: "league",
    region: "foreign",
  },
  {
    code: "DED",
    name: "Eredivisie",
    flagUrl: "https://crests.football-data.org/8601.svg",
    country: "Alankomaat",
    format: "league",
    region: "foreign",
  },
  {
    code: "PPL",
    name: "Primeira Liga",
    flagUrl: "https://crests.football-data.org/765.svg",
    country: "Portugali",
    format: "league",
    region: "foreign",
  },
  {
    code: "PD",
    name: "Primera Division (LaLiga)",
    flagUrl: "https://crests.football-data.org/760.svg",
    country: "Espanja",
    format: "league",
    region: "foreign",
  },
  {
    code: "BSA",
    name: "Campeonato Brasileiro Série A",
    flagUrl: "https://crests.football-data.org/764.svg",
    country: "Brasilia",
    format: "league",
    region: "foreign",
  },
  {
    code: "CL",
    name: "Mestarien liiga",
    flagUrl: "https://crests.football-data.org/EUR.svg",
    country: "Eurooppa",
    format: "cup",
    region: "foreign",
  },
  // Competitions between national teams, on /maajoukkueet.
  {
    code: "WC",
    name: "MM-kisat",
    // The World area has no flag of its own; see `Competition.flagUrl`.
    flagUrl: "/fifa.svg",
    country: "Maailma",
    format: "cup",
    region: "national-teams",
    // 2024 and 2025 both 403 on our plan; 2026 is the only reachable season.
    earliestSeason: 2026,
  },
  {
    code: "EC",
    name: "EM-kisat",
    // UEFA's own wordmark, which also tells the Euro apart from the Champions
    // League's plain Europe flag.
    flagUrl: "/uefa.svg",
    country: "Eurooppa",
    format: "cup",
    region: "national-teams",
    // 2023 and 2025 both 403 on our plan.
    earliestSeason: 2024,
  },
];

/**
 * Which registry a competition code belongs to, or null when nothing has it.
 * The inverse of `competitionsInRegion`.
 *
 * decisions/026-favourites.md
 */
export function regionOfCompetition(code: string): CompetitionRegion | null {
  return SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.region ?? null;
}

/**
 * The competitions one region offers, in registry order.
 *
 * decisions/016-world-cup-and-euro.md
 */
export function competitionsInRegion(region: CompetitionRegion): Competition[] {
  return SUPPORTED_COMPETITIONS.filter((competition) => competition.region === region);
}

export type CompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * The `kilpailu` query parameter, accepted only when it names a competition of
 * this one region.
 *
 * decisions/006-other-competitions.md
 * decisions/016-world-cup-and-euro.md
 */
export function parseCompetitionParam(
  rawValue: string | string[] | undefined,
  region: CompetitionRegion
): CompetitionParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string") return { kind: "invalid" };

  return competitionsInRegion(region).some((competition) => competition.code === rawValue)
    ? { kind: "valid", code: rawValue }
    : { kind: "invalid" };
}

export function getCompetitionName(code: string): string {
  return SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.name ?? code;
}

/**
 * A competition's format. An unknown code answers `"league"`.
 *
 * decisions/014-champions-league.md
 */
export function getCompetitionFormat(code: string): CompetitionFormat {
  return (
    SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.format ?? "league"
  );
}

/**
 * The oldest season a competition can be asked for: its own floor where it has
 * one, otherwise the plan-wide floor the caller supplies.
 *
 * decisions/016-world-cup-and-euro.md
 */
export function earliestSeasonFor(code: string, planFloor: number): number {
  return (
    SUPPORTED_COMPETITIONS.find((competition) => competition.code === code)?.earliestSeason ??
    planFloor
  );
}

export function isCupCompetition(code: string): boolean {
  return getCompetitionFormat(code) === "cup";
}
