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
 * `LAST_32` and `THIRD_PLACE` occur in no Champions League season but are named
 * here anyway: the World Cup has both, and leaving them out would put a raw
 * `THIRD_PLACE` in front of a Finnish reader the moment #165 lands. Naming them
 * now costs two lines; discovering them untranslated in production does not.
 *
 * The passthrough in `getStageName` is the last resort for a stage no one has
 * seen yet. Every stage the provider is known to emit belongs in this map.
 */
const STAGE_NAMES: Record<string, string> = {
  LEAGUE_STAGE: "Liigavaihe",
  GROUP_STAGE: "Lohkovaihe",
  PLAYOFFS: "Pudotuspelikarsinta",
  LAST_32: "Kahdeksannesvälierät",
  LAST_16: "Neljännesvälierät",
  QUARTER_FINALS: "Puolivälierät",
  SEMI_FINALS: "Välierät",
  THIRD_PLACE: "Pronssiottelu",
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

/**
 * The rounds drawn as a tree, in order. Stops at the quarter-finals because
 * that is the widest round a tree can show and still be read on a phone:
 * `LAST_16` is eight ties across, `LAST_32` sixteen.
 */
export const BRACKET_STAGES = ["QUARTER_FINALS", "SEMI_FINALS", "FINAL"];

/** Whether a round is drawn into the tree rather than listed above it. */
export function isDrawnStage(stage: string): boolean {
  return BRACKET_STAGES.includes(stage);
}

/** The stages that produce a standings table rather than knockout ties. */
const TABLE_PHASE_STAGES = new Set([LEAGUE_STAGE, GROUP_STAGE]);

/**
 * The season's knockout rounds, in progression order — **derived from the
 * data**, as everything a knockout round is defined by: not a table phase.
 *
 * Deliberately not a hardcoded list of stage names. `listSeasonStages` already
 * derives the match list's `Vaihe` options from the season's own matches, so a
 * fixed list here would let a stage the provider adds appear in the dropdown
 * and vanish from the standings page — which is precisely how
 * `Pudotuspelikarsinta` came to be invisible in the first version.
 */
export function listKnockoutStages(matches: StagedMatch[]): string[] {
  return listSeasonStages(matches).filter((stage) => !TABLE_PHASE_STAGES.has(stage));
}

/**
 * The Finnish name for a stage. An unmapped stage falls through to its raw
 * provider value: a format change stays visible rather than rendering blank or
 * under a wrong Finnish label. Add any newly observed stage to `STAGE_NAMES`
 * rather than relying on this.
 */
export function getStageName(stage: string): string {
  return STAGE_NAMES[stage] ?? stage;
}

/**
 * `GROUP_A` → `Lohko A`.
 *
 * A group is always a *lohko* whatever the provider calls it, so an
 * unrecognised value keeps the Finnish word and carries the raw identifier as
 * its label — `Lohko 1`, not a bare `1`. Unlike `getStageName`, there is
 * nothing to translate here beyond the noun itself, so no value ever reaches a
 * heading without it: a raw provider token alone would be a user-facing string
 * that is not Finnish.
 */
export function getGroupName(group: string): string {
  const match = /^GROUP_(.+)$/.exec(group);
  return `Lohko ${match ? match[1] : group}`;
}

function stageRank(stage: string): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

/**
 * Every stage present in the season's matches, in **progression** order.
 *
 * Deliberately not the provider's own array order. The two coincide in every
 * response checked, so relying on the provider buys nothing and costs
 * determinism: a reordered response would silently reshuffle the `Vaihe`
 * selector. `STAGE_ORDER` states the progression once, and an unrecognised
 * stage sorts last rather than disappearing. See decisions/014-champions-league.md.
 */
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

/**
 * Whether a round's matches are two-legged ties, decided from the data: some
 * team pair plays twice.
 *
 * `matchday` cannot answer this. Champions League numbers its legs 1 and 2,
 * the World Cup leaves knockout `matchday` null, and the European Championship
 * continues the group-stage counter — its quarter-finals are matchday 5, which
 * is neither a leg nor a round. Printing that under `Osaottelu` claims a
 * second leg that was never played. See specs/016-world-cup-and-euro.md.
 */
export function isTwoLeggedRound(
  matches: Array<{ homeTeamProviderId: number; awayTeamProviderId: number }>
): boolean {
  const seen = new Set<string>();
  for (const match of matches) {
    const [low, high] =
      match.homeTeamProviderId < match.awayTeamProviderId
        ? [match.homeTeamProviderId, match.awayTeamProviderId]
        : [match.awayTeamProviderId, match.homeTeamProviderId];
    const key = `${low}-${high}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
