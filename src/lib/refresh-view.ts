/**
 * Types and validation shared by the forced-refresh page, its client
 * components and its server actions, from specs/029-forced-season-refresh.md.
 *
 * Client-safe on purpose: no database import, no provider import, no
 * `node:crypto`. `refresh-form.tsx` and `refresh-confirm.tsx` are browser
 * bundles, and the modules that do the work — `refresh-diff.ts`,
 * `force-refresh.ts`, `refresh-runs.ts` — must not travel with them. The same
 * boundary `admin-user-view.ts` and `favourite-keys.ts` exist for.
 */

/** The providers a season can be refreshed from. */
export const REFRESH_SOURCES = ["taso", "football-data"] as const;

export type RefreshSource = (typeof REFRESH_SOURCES)[number];

export function isRefreshSource(value: unknown): value is RefreshSource {
  return REFRESH_SOURCES.includes(value as RefreshSource);
}

/**
 * How the competition `<select>` encodes one option, and how an action reads
 * it back.
 *
 * One control rather than a provider radio plus a competition list: which
 * provider a competition belongs to is a fact about the competition, not a
 * question to put to an admin. `:` is safe as the separator because no
 * competition code contains one — both registries use upper-case letters and
 * digits.
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
 * not one this app produced.
 *
 * Shape only — that the code names a real competition is checked against the
 * registries by the caller, which is where the registries live. This function
 * stays client-safe so the form can use it too.
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

/** One option in the competition `<select>`, grouped by region in the markup. */
export type CompetitionOption = {
  value: string;
  label: string;
  source: RefreshSource;
};

/** One option in the season `<select>`. Mirrors `SeasonOption` in seasons.ts. */
export type SeasonChoice = {
  seasonId: number;
  label: string;
};

/** Rows added, rows changed, rows removed — for one table, in one run. */
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
 * A team whose `starting_points` would move — the field this whole feature
 * exists for, since it is where TASO carries a points deduction.
 */
export type DeductionChange = {
  teamName: string;
  /** Null when the team had no value stored, or would lose the one it has. */
  from: number | null;
  to: number | null;
};

/**
 * A stored match the provider no longer returns.
 *
 * Carried by name rather than counted, because a removal is the only
 * irreversible thing this tool does and a number alone is not enough to judge
 * it by — see the spec's note on partial provider answers.
 */
export type RemovedMatch = {
  providerMatchId: number;
  /** ISO 8601. `kickoff_at` is `not null` in both match tables. */
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
};

/** How many removed matches the confirmation lists before it truncates. */
export const REMOVED_MATCHES_SHOWN = 20;

/** How many past runs the page lists. */
export const RUN_LIST_LIMIT = 20;

/**
 * What would change, computed before anything is written and shown to the
 * admin for approval.
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
   * A stable fingerprint of the provider rows this preview was built from.
   *
   * The apply recomputes it and refuses if it no longer matches, so "what you
   * saw is what you applied" is a checked fact rather than an assumption about
   * timing.
   */
  snapshotHash: string;
};

export function previewHasChanges(preview: RefreshPreview): boolean {
  return (
    !isEmptyCounts(preview.matches) ||
    (preview.groupRows !== null && !isEmptyCounts(preview.groupRows))
  );
}

/**
 * Why a preview or an apply refused.
 *
 * `empty` is the one that carries the feature's core rule: a provider answering
 * with nothing, for a season we hold rows for, never writes and never deletes.
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

/** One row of the run list, as the page hands it to the client component. */
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
