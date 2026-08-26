import { EARLIEST_TASO_SEASON } from "./taso";

/**
 * One `category_id` and the first season it covers. A competition can outlive
 * its own identifier in TASO — the same competition is published under a
 * different `category_id` in an earlier era — so a competition holds a list of
 * these rather than a single id. See specs/013-more-finnish-competitions.md.
 */
export type CompetitionCategory = {
  fromSeason: number;
  categoryId: string;
};

export type DomesticCompetition = {
  /** The `kilpailu` query value, and the competition's current `category_id`. */
  code: string;
  /** The competition's current name, shown in the picker. */
  name: string;
  /** Newest first, so the first entry at or below a season wins. */
  categories: CompetitionCategory[];
  /**
   * The `competition_id` prefix, when the competition is not inside the
   * `spljp{YY}` season umbrella.
   *
   * Almost every Finnish competition is a *category* within that umbrella.
   * Ykkösliigacup is not: it is its own competition, published as
   * `M1LCUP{YY}`. Omitted means the umbrella. See specs/015-finnish-cups.md.
   */
  competitionIdPrefix?: string;
  /**
   * Cup competitions render differently: a bracket, and rounds the reader can
   * collapse. Omitted means a league, so no existing entry changes behaviour.
   * See specs/015-finnish-cups.md.
   */
  format?: "league" | "cup";
};

/** The season umbrella every competition belongs to unless it says otherwise. */
const SEASON_UMBRELLA_PREFIX = "spljp";

/**
 * Finnish competitions, shown on the `/kotimaa` picker — separate from
 * `competitions.ts`'s `SUPPORTED_COMPETITIONS` (the football-data.org list
 * behind `/ulkomaat/sarjataulukko`'s `kilpailu=`), per specs/009-veikkausliiga.md:
 * this list is never added to that one.
 *
 * Ordered by tier rather than grouped by gender or age — confirmed in chat that
 * the picker stays a flat list, even though TASO supplies a grouping in
 * `category_group_name`. See specs/013-more-finnish-competitions.md.
 */
export const DEFAULT_DOMESTIC_COMPETITION_CODE = "VL";

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
  // The junior competitions changed age group and identifier together, so TASO
  // publishes each era under a different `category_id`. Confirmed against
  // `getCategories` for every season 2015-2026.
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
  // The cups close the list rather than slotting into the tier order above:
  // a cup is not a tier, and every competition in it also plays a league.
  // Added in specs/015-finnish-cups.md.
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
  // Its own competition rather than a category in the umbrella, and reachable
  // only from 2024 — M1LCUP22, M1LCUP23 and M1LCUP27 all return zero
  // categories.
  {
    code: "M1LCUP",
    name: "Ykkösliigacup",
    categories: [{ fromSeason: 2024, categoryId: "M1LCUP" }],
    competitionIdPrefix: "M1LCUP",
    format: "cup",
  },
];

function findCompetition(code: string): DomesticCompetition | undefined {
  return DOMESTIC_COMPETITIONS.find((competition) => competition.code === code);
}

export function getDomesticCompetitionName(code: string): string {
  return findCompetition(code)?.name ?? code;
}

/**
 * The `category_id` to query for one competition in one season. `categories`
 * is ordered newest first, so the first entry starting at or below the season
 * is the match.
 *
 * Total rather than nullable: a season below the competition's floor cannot be
 * selected, since the season selector is built from that same floor, so the
 * oldest range answers that case rather than forcing every caller to handle a
 * null that only a bug could produce. An unknown code answers with itself,
 * which is what the current `category_id` would be.
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
 * Needed wherever a question spans the competition's whole history rather than
 * one season — "what is the newest season we have stored for this
 * competition?" cannot be answered from a single era's id, since a junior
 * competition's rows are split across two or three of them.
 */
export function categoryIdsFor(code: string): string[] {
  const categories = findCompetition(code)?.categories ?? [];
  return categories.length === 0 ? [code] : categories.map((category) => category.categoryId);
}

/**
 * The oldest season a competition can be asked for — the floor of its own
 * season selector, which is not the same for every competition (Ykkösliiga
 * did not exist before 2024). Falls back to the provider-wide floor for an
 * unknown code, so a bad `kilpailu` value cannot widen the range.
 */
export function earliestSeasonFor(code: string): number {
  const categories = findCompetition(code)?.categories ?? [];
  const seasons = categories.map((category) => category.fromSeason);
  return seasons.length === 0 ? EARLIEST_TASO_SEASON : Math.min(...seasons);
}

/**
 * The `competition_id` to query for one competition in one season.
 *
 * Almost always the season umbrella (`spljp26`); a competition that declares
 * its own prefix gets that instead (`M1LCUP26`). The two-digit year is shared,
 * so only the prefix varies.
 *
 * An unknown code answers with the umbrella, which is what every competition
 * used before Ykkösliigacup existed — a bad `kilpailu` value cannot reach a
 * competition id nothing validates.
 */
export function competitionIdForSeason(code: string, seasonId: number): string {
  const prefix = findCompetition(code)?.competitionIdPrefix ?? SEASON_UMBRELLA_PREFIX;
  return `${prefix}${String(seasonId % 100).padStart(2, "0")}`;
}

/**
 * Whether a competition is a cup. An unknown code answers `false`: the league
 * rendering is the one that has always existed, so a bad `kilpailu` value
 * cannot route into the newer path.
 */
export function isDomesticCup(code: string): boolean {
  return findCompetition(code)?.format === "cup";
}

export type DomesticCompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };

/**
 * Validates the `kilpailu` query parameter against the Finnish competition
 * list — same rule as `parseCompetitionParam` in `competitions.ts`.
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
