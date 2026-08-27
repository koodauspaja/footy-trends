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

/**
 * Which section of the site a competition belongs to. `/ulkomaat` holds the
 * foreign leagues and Champions League; `/maajoukkueet` holds competitions
 * between national teams. See specs/016-world-cup-and-euro.md.
 */
export type CompetitionRegion = "foreign" | "national-teams";

export type Competition = {
  code: string;
  name: string;
  /**
   * The area's flag, or a local asset where the provider has none.
   *
   * football-data returns `flag: null` for the World area, so the World Cup
   * carries FIFA's own wordmark from `public/fifa.svg` instead. That file is
   * Wikimedia Commons' `PD-textlogo`: too simple to attract copyright, and
   * used here only to identify FIFA's own competition.
   *
   * Not football-data's competition emblem, which their terms would require
   * separate consent for — a different question from this one, and the reason
   * no club crest appears anywhere in this app.
   */
  flagUrl: string;
  /** Finnish country name, for the flag's alt text — the flag represents the country, not the league. */
  country: string;
  format: CompetitionFormat;
  region: CompetitionRegion;
  /**
   * The oldest season this competition can be asked for, when that is later
   * than the plan-wide floor.
   *
   * A league has a season every year, so the configured floor answers for it.
   * A tournament does not: our plan reaches the 2026 World Cup and the 2024
   * Euro and nothing else — every other season 403s. Offering them would put a
   * guaranteed error behind the selector. Omitted means the plan-wide floor.
   */
  earliestSeason?: number;
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

/**
 * The competition a region falls back to when `kilpailu` is absent or invalid.
 * Per region, so a bad value on `/maajoukkueet` lands on the World Cup rather
 * than bouncing the reader to a Premier League page in another section.
 */
const REGION_DEFAULTS: Record<CompetitionRegion, string> = {
  foreign: DEFAULT_COMPETITION_CODE,
  "national-teams": "WC",
};

export function defaultCompetitionFor(region: CompetitionRegion): string {
  return REGION_DEFAULTS[region];
}

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
    // UEFA's own wordmark, from Wikimedia Commons under the same PD-textlogo
    // terms as FIFA's. It also tells the Euro apart from Champions League,
    // which carries the plain Europe flag — the two would otherwise look
    // identical in a picker.
    flagUrl: "/uefa.svg",
    country: "Eurooppa",
    format: "cup",
    region: "national-teams",
    // 2023 and 2025 both 403 on our plan.
    earliestSeason: 2024,
  },
];

/** The competitions one region offers, in registry order. */
export function competitionsInRegion(region: CompetitionRegion): Competition[] {
  return SUPPORTED_COMPETITIONS.filter((competition) => competition.region === region);
}

export type CompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * Validates the `kilpailu` query parameter against **one region's** competition
 * list. An unvalidated value must never reach the provider URL, a cache key,
 * or a query — same rule as `parseSeasonParam`.
 *
 * Scoped to a region rather than the whole list, so `?kilpailu=PL` on
 * `/maajoukkueet` is rejected rather than rendering a Premier League page under
 * a heading that says national teams.
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

/**
 * The oldest season a competition can be asked for: its own floor where it has
 * one, otherwise the plan-wide floor the caller supplies.
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
