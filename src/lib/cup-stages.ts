/**
 * A cup competition's phases: which stages a season has, what to call them in
 * Finnish, and which of them are knockout rounds.
 *
 * decisions/014-champions-league.md
 * decisions/016-world-cup-and-euro.md
 * decisions/019-match-page.md
 */

/**
 * A match, as far as anything in this module cares.
 *
 * decisions/014-champions-league.md
 */
type StagedMatch = { stage: string | null };

/**
 * football-data's marker for an ordinary league season. Not in `STAGE_NAMES`:
 * it is not a phase a reader needs named.
 *
 * decisions/019-match-page.md
 */
export const REGULAR_SEASON = "REGULAR_SEASON";

export const LEAGUE_STAGE = "LEAGUE_STAGE";
export const GROUP_STAGE = "GROUP_STAGE";

/**
 * Provider stage to Finnish. Knockout rounds are named by fraction: the round
 * of 16 is `Neljännesvälierät`. Every stage the provider emits belongs here.
 *
 * decisions/014-champions-league.md
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
 * The order stages are presented in. A stage missing from the list sorts last,
 * so an unrecognised one stays visible.
 *
 * decisions/014-champions-league.md
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
 * The rounds drawn as a tree, in order: from the quarter-finals, the widest
 * round a tree can show on a phone.
 *
 * decisions/014-champions-league.md
 */
export const BRACKET_STAGES = ["QUARTER_FINALS", "SEMI_FINALS", "FINAL"];

/**
 * Whether a round is drawn into the tree, not listed above it.
 *
 * decisions/014-champions-league.md
 */
export function isDrawnStage(stage: string): boolean {
  return BRACKET_STAGES.includes(stage);
}

/**
 * The stages that produce a standings table, not knockout ties.
 *
 * decisions/014-champions-league.md
 */
const TABLE_PHASE_STAGES = new Set([LEAGUE_STAGE, GROUP_STAGE]);

/**
 * The season's knockout rounds, in progression order, derived from the data:
 * every stage that is not a table phase.
 *
 * decisions/014-champions-league.md
 */
export function listKnockoutStages(matches: StagedMatch[]): string[] {
  return listSeasonStages(matches).filter((stage) => !TABLE_PHASE_STAGES.has(stage));
}

/**
 * The Finnish name for a stage. An unmapped stage falls through to its raw
 * provider value, so a format change stays visible.
 *
 * decisions/014-champions-league.md
 */
export function getStageName(stage: string): string {
  return STAGE_NAMES[stage] ?? stage;
}

/**
 * `GROUP_A` becomes `Lohko A`. An unrecognised value keeps the Finnish word
 * with the raw identifier as its label: `Lohko 1`.
 *
 * decisions/014-champions-league.md
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
 * Every stage present in the season's matches, in progression order, not the
 * provider's own.
 *
 * decisions/014-champions-league.md
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
 * Which standings shape the season uses, decided from the data and not from
 * the season number.
 *
 * decisions/014-champions-league.md
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
 * The `vaihe` query parameter, accepted only when this season has that stage.
 *
 * decisions/014-champions-league.md
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
 * The stage to show by default: the one holding the earliest unfinished match,
 * or the season's last once everything is finished.
 *
 * decisions/014-champions-league.md
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
 * decisions/016-world-cup-and-euro.md
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
