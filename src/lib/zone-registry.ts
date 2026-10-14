/**
 * What a place in a foreign league's table is worth, kept by hand per
 * competition and season: football-data publishes no rules. The registry holds
 * the places Wikipedia's table for the league and season marks by position.
 *
 * decisions/065-foreign-league-zones.md
 */

import type { ZoneKind, ZoneLevel } from "./competition-zones";

/**
 * One stretch of the table: the first and last position, and what they lead to.
 *
 * decisions/065-foreign-league-zones.md
 */
type Place = readonly [from: number, to: number, name: PlaceName];

const PLACES = {
  championsLeague: { label: "Mestarien liiga", kind: "cup" },
  championsLeagueQualifying: { label: "Mestarien liigan karsinta", kind: "cup" },
  europaLeague: { label: "Eurooppa-liiga", kind: "cup" },
  europaLeagueQualifying: { label: "Eurooppa-liigan karsinta", kind: "cup" },
  conferenceLeague: { label: "Konferenssiliiga", kind: "cup" },
  conferenceLeagueQualifying: { label: "Konferenssiliigan karsinta", kind: "cup" },
  europeanPlayOff: { label: "Karsinta Europeleihin", kind: "playoff" },
  libertadores: { label: "Copa Libertadores", kind: "cup" },
  libertadoresQualifying: { label: "Copa Libertadoresin karsinta", kind: "cup" },
  sudamericana: { label: "Copa Sudamericana", kind: "cup" },
  promotion: { label: "Nousee", kind: "promotion" },
  promotionPlayOff: { label: "Nousukarsinta", kind: "playoff" },
  relegationPlayOff: { label: "Putoamiskarsinta", kind: "playoff" },
  relegation: { label: "Putoaa", kind: "relegation" },
} as const satisfies Record<string, { label: string; kind: ZoneKind }>;

type PlaceName = keyof typeof PLACES;

/**
 * A level as the registry stores it. A stretch no place covers is a level with
 * neither label nor kind, which holds its positions.
 *
 * decisions/065-foreign-league-zones.md
 */
export type RegistryLevel = ZoneLevel & { kind?: ZoneKind };

/**
 * The league's table size and its places for each stored season. A season that
 * is missing shows no zones.
 *
 * decisions/065-foreign-league-zones.md
 */
type League = {
  readonly teams: number;
  /** The line under the list when a level is a cup place, which a cup result can move. */
  readonly cupCaveat: string;
  readonly seasons: Readonly<Record<number, readonly Place[]>>;
};

const EUROPE_CAVEAT = "Eurooppa-paikat voivat muuttua cup-tuloksilla";
const BRAZIL_CAVEAT = "Cup-paikat voivat muuttua cup-tuloksilla";

const CL = "championsLeague";
const CLQ = "championsLeagueQualifying";
const EL = "europaLeague";
const ELQ = "europaLeagueQualifying";
const ECL = "conferenceLeague";
const ECLQ = "conferenceLeagueQualifying";
const EUPO = "europeanPlayOff";
const LIB = "libertadores";
const LIBQ = "libertadoresQualifying";
const SUD = "sudamericana";
const UP = "promotion";
const UPPO = "promotionPlayOff";
const RELPO = "relegationPlayOff";
const REL = "relegation";

const PREMIER_LEAGUE_REL: Place = [18, 20, REL];
const CHAMPIONSHIP_STABLE: readonly Place[] = [
  [1, 2, UP],
  [3, 6, UPPO],
  [22, 24, REL],
];
const LIGUE_1_STABLE: readonly Place[] = [
  [1, 3, CL],
  [4, 4, CLQ],
  [5, 6, EL],
  [7, 7, ECL],
  [16, 16, RELPO],
  [17, 18, REL],
];
const BOTTOM_TWO_AND_PLAY_OFF: readonly Place[] = [
  [16, 16, RELPO],
  [17, 18, REL],
];
const BOTTOM_THREE: readonly Place[] = [[18, 20, REL]];

export const ZONE_REGISTRY: Readonly<Record<string, League>> = {
  PL: {
    teams: 20,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], PREMIER_LEAGUE_REL],
      2024: [[1, 5, CL], [6, 7, EL], PREMIER_LEAGUE_REL],
      2025: [[1, 5, CL], [6, 7, EL], [8, 8, ECL], PREMIER_LEAGUE_REL],
      2026: [[1, 4, CL], [5, 5, EL], PREMIER_LEAGUE_REL],
    },
  },
  ELC: {
    teams: 24,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: CHAMPIONSHIP_STABLE,
      2024: CHAMPIONSHIP_STABLE,
      2025: CHAMPIONSHIP_STABLE,
      2026: [
        [1, 2, UP],
        [3, 8, UPPO],
        [22, 24, REL],
      ],
    },
  },
  FL1: {
    teams: 18,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: LIGUE_1_STABLE,
      2024: LIGUE_1_STABLE,
      2025: LIGUE_1_STABLE,
      2026: [[1, 3, CL], [4, 4, CLQ], [5, 5, EL], [6, 6, ECL], ...BOTTOM_TWO_AND_PLAY_OFF],
    },
  },
  BL1: {
    teams: 18,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [[1, 5, CL], [6, 7, EL], [8, 8, ECL], ...BOTTOM_TWO_AND_PLAY_OFF],
      2024: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], ...BOTTOM_TWO_AND_PLAY_OFF],
      2025: [[1, 4, CL], [5, 6, EL], [7, 7, ECL], ...BOTTOM_TWO_AND_PLAY_OFF],
      2026: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], ...BOTTOM_TWO_AND_PLAY_OFF],
    },
  },
  SA: {
    teams: 20,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [[1, 5, CL], [6, 7, EL], [8, 8, ECL], ...BOTTOM_THREE],
      2024: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], ...BOTTOM_THREE],
      2025: [[1, 4, CL], [5, 6, EL], [7, 7, ECL], ...BOTTOM_THREE],
      2026: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], ...BOTTOM_THREE],
    },
  },
  DED: {
    teams: 18,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [
        [1, 2, CL],
        [3, 3, CLQ],
        [4, 4, EL],
        [5, 5, ELQ],
        [6, 9, EUPO],
        ...BOTTOM_TWO_AND_PLAY_OFF,
      ],
      2024: [
        [1, 2, CL],
        [3, 3, CLQ],
        [4, 4, ELQ],
        [5, 6, EUPO],
        [7, 7, EL],
        [8, 9, EUPO],
        ...BOTTOM_TWO_AND_PLAY_OFF,
      ],
      2025: [
        [1, 2, CL],
        [3, 3, CLQ],
        [4, 4, ELQ],
        [5, 6, EUPO],
        [7, 7, EL],
        [8, 9, EUPO],
        ...BOTTOM_TWO_AND_PLAY_OFF,
      ],
      2026: [[1, 1, CL], [2, 2, CLQ], [3, 3, ELQ], [4, 7, EUPO], ...BOTTOM_TWO_AND_PLAY_OFF],
    },
  },
  PPL: {
    teams: 18,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [[1, 2, CL], [3, 3, EL], [4, 4, ELQ], [5, 5, ECLQ], ...BOTTOM_TWO_AND_PLAY_OFF],
      2024: [
        [1, 1, CL],
        [2, 2, CLQ],
        [3, 3, EL],
        [4, 4, ELQ],
        [5, 5, ECLQ],
        ...BOTTOM_TWO_AND_PLAY_OFF,
      ],
      2025: [[1, 2, CL], [3, 3, ELQ], [4, 4, ECLQ], ...BOTTOM_TWO_AND_PLAY_OFF],
      2026: [[1, 2, CL], [3, 3, CLQ], [4, 4, ELQ], [5, 5, ECLQ], ...BOTTOM_TWO_AND_PLAY_OFF],
    },
  },
  PD: {
    teams: 20,
    cupCaveat: EUROPE_CAVEAT,
    seasons: {
      2023: [[1, 4, CL], [5, 6, EL], [7, 7, ECL], ...BOTTOM_THREE],
      2024: [[1, 5, CL], [6, 7, EL], [8, 8, ECL], ...BOTTOM_THREE],
      2025: [[1, 5, CL], [6, 6, EL], [7, 7, ECL], ...BOTTOM_THREE],
      2026: [[1, 4, CL], [5, 5, EL], [6, 6, ECL], ...BOTTOM_THREE],
    },
  },
  BSA: {
    teams: 20,
    cupCaveat: BRAZIL_CAVEAT,
    seasons: {
      2023: [
        [1, 4, LIB],
        [5, 6, LIBQ],
        [8, 14, SUD],
        [17, 20, REL],
      ],
      2024: [
        [1, 6, LIB],
        [7, 8, LIBQ],
        [9, 14, SUD],
        [17, 20, REL],
      ],
      2025: [
        [1, 5, LIB],
        [6, 7, LIBQ],
        [8, 14, SUD],
        [17, 20, REL],
      ],
      2026: [
        [1, 4, LIB],
        [5, 5, LIBQ],
        [6, 11, SUD],
        [17, 20, REL],
      ],
    },
  },
};

/**
 * The places as levels, each stretch no place covers a level of its own so the
 * positions after it stay where the places say. The places are written in table
 * order.
 *
 * decisions/065-foreign-league-zones.md
 */
function toLevels(places: readonly Place[]): RegistryLevel[] {
  const levels: RegistryLevel[] = [];
  let taken = 0;

  for (const [from, to, name] of places) {
    if (from > taken + 1) {
      levels.push({ level: levels.length + 1, teamCount: from - taken - 1, label: null });
    }
    const { label, kind } = PLACES[name];
    levels.push({ level: levels.length + 1, teamCount: to - from + 1, label, kind });
    taken = to;
  }

  return levels;
}

/**
 * A competition's levels for a season: none for a season the registry does not
 * hold, and for a competition that is not one of the nine leagues.
 *
 * decisions/065-foreign-league-zones.md
 */
export function registryLevels(code: string, seasonId: number): RegistryLevel[] {
  // Own keys only: a code is a string from a URL, and `constructor` is not a league.
  const league = Object.hasOwn(ZONE_REGISTRY, code) ? ZONE_REGISTRY[code] : undefined;
  const places = league?.seasons[seasonId];
  return places === undefined ? [] : toLevels(places);
}

/**
 * The line under the list when a level is a cup place, which a cup result can
 * move after the table has placed it.
 *
 * decisions/065-foreign-league-zones.md
 */
export function cupCaveat(code: string, levels: readonly RegistryLevel[]): string | null {
  if (!levels.some((level) => level.kind === "cup")) return null;
  return Object.hasOwn(ZONE_REGISTRY, code) ? (ZONE_REGISTRY[code]?.cupCaveat ?? null) : null;
}
