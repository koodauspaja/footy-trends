import { EARLIEST_TASO_SEASON } from "./taso";

/**
 * One `category_id` and the first season it covers. A competition holds a list
 * of these: TASO has published some under a different id in an earlier era.
 *
 * decisions/013-more-finnish-competitions.md
 */
export type CompetitionCategory = {
  fromSeason: number;
  categoryId: string;
};

/**
 * One Finnish competition as the registry holds it.
 *
 * decisions/009-veikkausliiga.md
 * decisions/012-finnish-urls-english-code.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/043-liigacup.md
 */
export type DomesticCompetition = {
  /** The `kilpailu` query value, and the competition's current `category_id`. */
  code: string;
  /** The competition's current name, shown in the picker. */
  name: string;
  /** Newest first, so the first entry at or below a season wins. */
  categories: CompetitionCategory[];
  /**
   * The `competition_id` prefix, when the competition is not inside the
   * `spljp{YY}` season umbrella. Omitted means the umbrella.
   */
  competitionIdPrefix?: string;
  /**
   * A cup renders as a bracket with collapsible rounds. Omitted means a league.
   */
  format?: "league" | "cup";
  /**
   * How a cup is played, and so how its season page is laid out. Declared, never
   * inferred from a season's data. Omitted means `knockout`.
   */
  cupFormat?: CupFormat;
};

export type CupFormat = "knockout" | "groups-and-playoff";

/**
 * The season umbrella every competition belongs to unless it says otherwise.
 *
 * decisions/015-finnish-cups.md
 */
const SEASON_UMBRELLA_PREFIX = "spljp";

/**
 * The competition `/kotimaa` falls back to when none is chosen.
 *
 * decisions/009-veikkausliiga.md
 * decisions/012-finnish-urls-english-code.md
 */
export const DEFAULT_DOMESTIC_COMPETITION_CODE = "VL";

/**
 * The Finnish competitions on the `/kotimaa` picker, by tier, with the cups
 * last.
 *
 * decisions/009-veikkausliiga.md
 * decisions/012-finnish-urls-english-code.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/043-liigacup.md
 */
export const DOMESTIC_COMPETITIONS: DomesticCompetition[] = [
  {
    code: "VL",
    name: "Veikkausliiga",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "VL" }],
  },
  // Ykkösliiga was created in 2024, when the men's second tier was renamed and
  // Ykkönen continued separately as a lower one. It has no earlier history to
  // map, unlike the junior competitions below.
  { code: "M1L", name: "Ykkösliiga", categories: [{ fromSeason: 2024, categoryId: "M1L" }] },
  {
    code: "M1",
    name: "Ykkönen",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "M1" }],
  },
  {
    code: "M2",
    name: "Miesten Kakkonen",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "M2" }],
  },
  {
    code: "NL",
    name: "Briotech Kansallinen Liiga",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "NL" }],
  },
  {
    code: "N1",
    name: "Kansallinen Ykkönen",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "N1" }],
  },
  // The junior competitions changed age group and identifier together, so each
  // era has its own `category_id`.
  {
    code: "P21SM",
    name: "P21 SM",
    categories: [
      { fromSeason: 2026, categoryId: "P21SM" },
      { fromSeason: 2017, categoryId: "P20SM" },
      { fromSeason: EARLIEST_TASO_SEASON, categoryId: "ASM" },
    ],
  },
  {
    code: "P211",
    name: "P21 Ykkönen",
    categories: [
      { fromSeason: 2026, categoryId: "P211" },
      { fromSeason: 2017, categoryId: "P201" },
      { fromSeason: EARLIEST_TASO_SEASON, categoryId: "APY" },
    ],
  },
  {
    code: "P18SM",
    name: "P18 SM",
    categories: [
      { fromSeason: 2026, categoryId: "P18SM" },
      { fromSeason: 2017, categoryId: "P17SM" },
      { fromSeason: EARLIEST_TASO_SEASON, categoryId: "BSM" },
    ],
  },
  {
    code: "T18SM",
    name: "T18 SM",
    categories: [
      { fromSeason: 2017, categoryId: "T18SM" },
      { fromSeason: EARLIEST_TASO_SEASON, categoryId: "BTSM" },
    ],
  },
  // The cups close the list: a cup is not a tier, and every competition in it
  // also plays a league.
  {
    code: "MSC",
    name: "Miesten Suomen Cup",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "MSC" }],
    format: "cup",
  },
  {
    code: "NSC",
    name: "Naisten Suomen Cup",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "NSC" }],
    format: "cup",
  },
  // Its own competition, not a category in the umbrella, with a different
  // category id in its first season. From 2023 only.
  {
    code: "LC",
    name: "Liigacup",
    categories: [
      { fromSeason: 2024, categoryId: "LC" },
      { fromSeason: 2023, categoryId: "LC2023" },
    ],
    competitionIdPrefix: "Liigacup",
    format: "cup",
    cupFormat: "groups-and-playoff",
  },
  // Its own competition rather than a category in the umbrella, and reachable
  // only from 2024 — M1LCUP22, M1LCUP23 and M1LCUP27 all return zero
  // categories.
  {
    code: "M1LCUP",
    name: "Ykkösliigacup",
    categories: [{ fromSeason: 2024, categoryId: "M1LCUP" }],
    competitionIdPrefix: "M1LCUP",
    format: "cup",
    cupFormat: "groups-and-playoff",
  },
];

function findCompetition(code: string): DomesticCompetition | undefined {
  return DOMESTIC_COMPETITIONS.find((competition) => competition.code === code);
}

export function getDomesticCompetitionName(code: string): string {
  return findCompetition(code)?.name ?? code;
}

/**
 * The `category_id` to query for one competition in one season: the first
 * entry at or below it. Never null: an unknown code answers with itself.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function categoryIdForSeason(code: string, seasonId: number): string {
  const categories = findCompetition(code)?.categories ?? [];
  const match = categories.find((category) => seasonId >= category.fromSeason) ?? categories.at(-1);
  return match?.categoryId ?? code;
}

/**
 * Every `category_id` a competition has ever been published under, newest
 * first.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function categoryIdsFor(code: string): string[] {
  const categories = findCompetition(code)?.categories ?? [];
  return categories.length === 0 ? [code] : categories.map((category) => category.categoryId);
}

/**
 * Every `category_id` any competition in the picker has ever been published
 * under: the set a stored row must belong to for the site to show it.
 *
 * decisions/020-context-free-team-page.md
 */
export function allDomesticCategoryIds(): string[] {
  return DOMESTIC_COMPETITIONS.flatMap((competition) =>
    competition.categories.map((category) => category.categoryId)
  );
}

/**
 * Which competition a stored `category_id` belongs to, or `null` if none
 * claims it.
 *
 * decisions/019-match-page.md
 */
export function competitionCodeForCategory(categoryId: string): string | null {
  const competition = DOMESTIC_COMPETITIONS.find((candidate) =>
    candidate.categories.some((category) => category.categoryId === categoryId)
  );
  return competition?.code ?? null;
}

/**
 * The oldest season a competition can be asked for: the floor of its season
 * selector. An unknown code gets the provider-wide floor.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function earliestSeasonFor(code: string): number {
  const categories = findCompetition(code)?.categories ?? [];
  const seasons = categories.map((category) => category.fromSeason);
  return seasons.length === 0 ? EARLIEST_TASO_SEASON : Math.min(...seasons);
}

/**
 * The `competition_id` to query for one competition in one season: the season
 * umbrella, or the competition's own prefix. An unknown code gets the umbrella.
 *
 * decisions/015-finnish-cups.md
 */
export function competitionIdForSeason(code: string, seasonId: number): string {
  const prefix = findCompetition(code)?.competitionIdPrefix ?? SEASON_UMBRELLA_PREFIX;
  return `${prefix}${String(seasonId % 100).padStart(2, "0")}`;
}

/**
 * The competition among `codes` whose registry names exactly this
 * `(competition_id, category_id)` pair for the season, or `null`.
 *
 * decisions/051-home-win-baseline.md
 */
export function competitionForSeasonPair(
  codes: readonly string[],
  competitionId: string,
  categoryId: string,
  seasonId: number
): string | null {
  return (
    codes.find(
      (code) =>
        competitionIdForSeason(code, seasonId) === competitionId &&
        categoryIdForSeason(code, seasonId) === categoryId
    ) ?? null
  );
}

/**
 * Whether a competition is a cup. An unknown code answers `false`.
 *
 * decisions/015-finnish-cups.md
 */
export function isDomesticCup(code: string): boolean {
  return findCompetition(code)?.format === "cup";
}

/**
 * How a cup is played. `knockout` unless it says otherwise, and for an unknown
 * code or a league.
 *
 * decisions/043-liigacup.md
 */
export function cupFormatFor(code: string): CupFormat {
  const competition = findCompetition(code);
  if (competition?.format !== "cup") return "knockout";
  return competition.cupFormat ?? "knockout";
}

export type DomesticCompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * The `kilpailu` query parameter, accepted only when it names a Finnish
 * competition.
 *
 * decisions/009-veikkausliiga.md
 * decisions/012-finnish-urls-english-code.md
 */
export function parseDomesticCompetitionParam(
  rawValue: string | string[] | undefined
): DomesticCompetitionParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string") return { kind: "invalid" };

  return findCompetition(rawValue) !== undefined
    ? { kind: "valid", code: rawValue }
    : { kind: "invalid" };
}
