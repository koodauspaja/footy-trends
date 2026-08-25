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
};

/**
 * Finnish competitions, shown on the `/kotimaa` picker — separate from
 * `competitions.ts`'s `SUPPORTED_COMPETITIONS` (the football-data.org list
 * behind `/ulkomaat/sarjataulukko`'s `kilpailu=`), per specs/009-veikkausliiga.md:
 * this list is never added to that one.
 */
export const DEFAULT_DOMESTIC_COMPETITION_CODE = "VL";

export const DOMESTIC_COMPETITIONS: DomesticCompetition[] = [
  {
    code: "VL",
    name: "Veikkausliiga",
    categories: [{ fromSeason: EARLIEST_TASO_SEASON, categoryId: "VL" }],
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
