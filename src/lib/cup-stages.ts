/**
 * A cup competition's phases: which stages a season has, what to call them in
 * Finnish, and which of them are knockout rounds rather than table-producing
 * ones. See specs/014-champions-league.md.
 */

/** A match, as far as anything in this module cares. */
type StagedMatch = { stage: string | null };

export const LEAGUE_STAGE = "LEAGUE_STAGE";
export const GROUP_STAGE = "GROUP_STAGE";

/**
 * Provider stage → Finnish. Finnish names knockout rounds by fraction, so the
 * round of 16 is `Neljännesvälierät` (a quarter of a quarter-final), not a
 * transliteration of "last 16".
 *
 * `LAST_32` and `THIRD_PLACE` are not in this map: no Champions League season
 * has them, and naming stages we cannot see would be guesswork. They fall
 * through to the raw provider value, which is the deliberate behaviour for any
 * stage a future competition introduces — visible, not silently blank.
 */
const STAGE_NAMES: Record<string, string> = {
  LEAGUE_STAGE: "Liigavaihe",
  GROUP_STAGE: "Lohkovaihe",
  PLAYOFFS: "Pudotuspelikarsinta",
  LAST_16: "Neljännesvälierät",
  QUARTER_FINALS: "Puolivälierät",
  SEMI_FINALS: "Välierät",
  FINAL: "Loppuottelu",
};

/**
 * The order stages are presented in, independent of the order the provider
 * happens to return matches in. A stage missing from this list sorts last,
 * keeping an unrecognised stage visible rather than dropping it.
 */
const STAGE_ORDER = [
  LEAGUE_STAGE,
  GROUP_STAGE,
  "PLAYOFFS",
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

/** The knockout rounds a bracket is drawn for, in order. */
export const BRACKET_STAGES = ["QUARTER_FINALS", "SEMI_FINALS", "FINAL"];

export function getStageName(stage: string): string {
  return STAGE_NAMES[stage] ?? stage;
}

/**
 * `GROUP_A` → `Lohko A`. An unrecognised group value is returned unchanged,
 * for the same reason `getStageName` passes through an unknown stage.
 */
export function getGroupName(group: string): string {
  const match = /^GROUP_(.+)$/.exec(group);
  return match ? `Lohko ${match[1]}` : group;
}

function stageRank(stage: string): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

/** Every stage present in the season's matches, in presentation order. */
export function listSeasonStages(matches: StagedMatch[]): string[] {
  const stages = new Set<string>();
  for (const match of matches) {
    if (match.stage !== null) stages.add(match.stage);
  }
  return [...stages].sort(
    (left, right) => stageRank(left) - stageRank(right) || left.localeCompare(right)
  );
}

/**
 * Which standings shape the season uses, decided from the data rather than
 * from the season number. Champions League ran eight groups in 2023/24 and a
 * single 36-team league phase from 2024/25, and the format has changed twice
 * in three seasons — a hardcoded cutoff would need editing the next time it
 * changes, and would be wrong until someone noticed.
 */
export type PhaseShape = "single" | "grouped" | "none";

export function resolvePhaseShape(matches: StagedMatch[]): PhaseShape {
  const stages = new Set(matches.map((match) => match.stage));
  if (stages.has(GROUP_STAGE)) return "grouped";
  if (stages.has(LEAGUE_STAGE)) return "single";
  return "none";
}

export type StageParamResult =
  | { kind: "absent" }
  | { kind: "valid"; stage: string }
  | { kind: "invalid" };

/**
 * Validates the `vaihe` query parameter against the stages this season
 * actually has. An unvalidated value must never reach a cache key or a query —
 * the same rule `parseCompetitionParam` and `parseSeasonParam` enforce.
 */
export function parseStageParam(
  rawValue: string | string[] | undefined,
  availableStages: string[]
): StageParamResult {
  if (rawValue === undefined || rawValue === "") return { kind: "absent" };
  if (typeof rawValue !== "string") return { kind: "invalid" };
  return availableStages.includes(rawValue)
    ? { kind: "valid", stage: rawValue }
    : { kind: "invalid" };
}

type StageCandidate = { stage: string | null; status: string; kickoffAt: Date };
const FINISHED_STATUS = "FINISHED";

/**
 * The stage to show by default: the one holding the earliest not-yet-finished
 * match, or the season's last stage once everything is finished. The cup
 * analogue of `resolveCurrentRound`, and deliberately separate from it — a
 * cup's `matchday` is a leg number, so the round logic cannot be reused.
 */
export function resolveCurrentStage(
  matches: StageCandidate[],
  availableStages: string[]
): string | undefined {
  if (availableStages.length === 0) return undefined;

  const nextUnplayed = matches
    .filter((match) => match.stage !== null && match.status !== FINISHED_STATUS)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime())[0];

  return nextUnplayed?.stage ?? availableStages.at(-1);
}
