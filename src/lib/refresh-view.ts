/**
 * Types and validation shared by the forced-refresh page, its client
 * components and its server actions. Client-safe: no database, provider or
 * `node:crypto` import.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * The providers a season can be refreshed from.
 *
 * decisions/029-forced-season-refresh.md
 */
export const REFRESH_SOURCES = ["taso", "football-data"] as const;

export type RefreshSource = (typeof REFRESH_SOURCES)[number];

export function isRefreshSource(value: unknown): value is RefreshSource {
  return REFRESH_SOURCES.includes(value as RefreshSource);
}

/**
 * The separator inside one competition `<select>` value, between the source and
 * the code. No competition code contains one.
 *
 * decisions/029-forced-season-refresh.md
 */
export const CHOICE_SEPARATOR = ":";

export type CompetitionChoice = {
  source: RefreshSource;
  code: string;
};

export function encodeChoice(choice: CompetitionChoice): string {
  return `${choice.source}${CHOICE_SEPARATOR}${choice.code}`;
}

/**
 * Reads a `<select>` value back into a source and a code, or `null` when it is
 * not one this app produced. Shape only: the caller checks the registries.
 *
 * decisions/029-forced-season-refresh.md
 */
export function decodeChoice(value: unknown): CompetitionChoice | null {
  if (typeof value !== "string") return null;

  const separatorAt = value.indexOf(CHOICE_SEPARATOR);
  if (separatorAt === -1) return null;

  const source = value.slice(0, separatorAt);
  const code = value.slice(separatorAt + 1);
  if (!isRefreshSource(source) || code === "") return null;

  return { source, code };
}

/**
 * One option in the competition `<select>`, grouped by region in the markup.
 *
 * decisions/029-forced-season-refresh.md
 */
export type CompetitionOption = {
  value: string;
  label: string;
  source: RefreshSource;
};

/**
 * One option in the season `<select>`. Mirrors `SeasonOption` in seasons.ts.
 *
 * decisions/029-forced-season-refresh.md
 */
export type SeasonChoice = {
  seasonId: number;
  label: string;
};

/**
 * Rows added, rows changed, rows removed: for one table, in one run.
 *
 * decisions/029-forced-season-refresh.md
 */
export type RowCounts = {
  inserted: number;
  updated: number;
  deleted: number;
};

export const NO_CHANGES: RowCounts = { inserted: 0, updated: 0, deleted: 0 };

export function isEmptyCounts(counts: RowCounts): boolean {
  return counts.inserted === 0 && counts.updated === 0 && counts.deleted === 0;
}

/**
 * A team whose `starting_points` would move, which is where TASO carries a
 * points deduction.
 *
 * decisions/029-forced-season-refresh.md
 */
export type DeductionChange = {
  teamName: string;
  /** Null when the team had no value stored, or would lose the one it has. */
  from: number | null;
  to: number | null;
};

/**
 * A stored match the provider no longer returns, carried by name and not
 * counted.
 *
 * decisions/029-forced-season-refresh.md
 */
export type RemovedMatch = {
  providerMatchId: number;
  /** ISO 8601. `kickoff_at` is `not null` in both match tables. */
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
};

/**
 * How many removed matches the confirmation lists before it truncates.
 *
 * decisions/029-forced-season-refresh.md
 */
export const REMOVED_MATCHES_SHOWN = 20;

/**
 * How many past runs the page lists.
 *
 * decisions/029-forced-season-refresh.md
 */
export const RUN_LIST_LIMIT = 20;

/**
 * What would change, computed before anything is written and shown to the
 * admin for approval.
 *
 * decisions/029-forced-season-refresh.md
 */
export type RefreshPreview = {
  source: RefreshSource;
  competitionCode: string;
  competitionName: string;
  seasonId: number;
  seasonLabel: string;
  matches: RowCounts;
  /** Null for football-data, which stores no group standings of its own. */
  groupRows: RowCounts | null;
  deductionChanges: DeductionChange[];
  removedMatches: RemovedMatch[];
  /**
   * A stable fingerprint of the provider rows this preview was built from. The
   * apply recomputes it and refuses when it no longer matches.
   */
  snapshotHash: string;
};

/**
 * Whether there is anything to apply: any row count, or any deduction.
 *
 * decisions/029-forced-season-refresh.md
 */
export function previewHasChanges(preview: RefreshPreview): boolean {
  return (
    !isEmptyCounts(preview.matches) ||
    (preview.groupRows !== null && !isEmptyCounts(preview.groupRows)) ||
    preview.deductionChanges.length > 0
  );
}

/**
 * Why a preview or an apply refused. `empty`: a provider answering with
 * nothing, for a season we hold rows for, never writes and never deletes.
 *
 * decisions/029-forced-season-refresh.md
 */
export type RefreshFailureReason =
  | "input"
  | "cache"
  | "provider"
  | "empty"
  /** Our own database would not say what we currently hold. */
  | "read"
  | "stale"
  | "write";

export type PreviewResult =
  | { ok: true; preview: RefreshPreview }
  | { ok: false; reason: RefreshFailureReason; storedRows?: number | undefined };

export type ApplyResult =
  | { ok: true; applied: RefreshPreview }
  /** `preview` carries the fresh diff when the provider's answer moved. */
  | { ok: false; reason: RefreshFailureReason; preview?: RefreshPreview | undefined };

export type SeasonsResult =
  | { ok: true; seasons: SeasonChoice[] }
  | { ok: false; reason: RefreshFailureReason };

/**
 * One row of the run list, as the page hands it to the client component.
 *
 * decisions/029-forced-season-refresh.md
 */
export type RefreshRunView = {
  id: number;
  source: RefreshSource;
  competitionName: string;
  seasonLabel: string;
  succeeded: boolean;
  reason: RefreshFailureReason | null;
  matches: RowCounts;
  groupRows: RowCounts | null;
  deductionsChanged: number;
  /** Null once the account that ran it has been deleted. */
  runByName: string | null;
  createdAt: string;
};
