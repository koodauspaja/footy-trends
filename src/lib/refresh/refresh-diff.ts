import { createHash } from "node:crypto";
import type { DeductionChange, RemovedMatch, RowCounts } from "./refresh-view";

/**
 * The pure half of the forced refresh: what would change if this provider
 * answer were applied to these stored rows. It takes rows and returns counts.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * The stored-match fields this module needs to name a removal.
 *
 * decisions/029-forced-season-refresh.md
 */
export type DiffableStoredMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

export type DiffableProviderMatch = {
  providerMatchId: number;
};

/**
 * The group-team fields the identity and the deduction are read from.
 *
 * decisions/029-forced-season-refresh.md
 */
export type DiffableGroupTeam = {
  groupId: number;
  teamProviderId: number;
  teamName: string;
  startingPoints: number | null;
};

export type MatchDiff = {
  counts: RowCounts;
  /** Every removal, in provider-id order — the caller decides how many to show. */
  removed: RemovedMatch[];
};

export type GroupDiff = {
  counts: RowCounts;
  deductionChanges: DeductionChange[];
};

/**
 * Whether two stored values differ. Two `Date`s for the same instant do not.
 *
 * decisions/029-forced-season-refresh.md
 */
function valuesDiffer(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() !== right.getTime();
  if (left instanceof Date || right instanceof Date) return true;
  return left !== right;
}

/**
 * Whether applying `provider` to `stored` would change anything, compared
 * over the provider row's own keys.
 *
 * decisions/029-forced-season-refresh.md
 */
function rowChanged(stored: object, provider: object): boolean {
  const storedValues = stored as Record<string, unknown>;
  const providerValues = provider as Record<string, unknown>;
  return Object.keys(providerValues).some((key) =>
    valuesDiffer(storedValues[key], providerValues[key])
  );
}

/**
 * The match diff, keyed by `providerMatchId`: the unique index on both match
 * tables.
 *
 * decisions/029-forced-season-refresh.md
 */
export function diffMatches<S extends DiffableStoredMatch, P extends DiffableProviderMatch>(
  stored: readonly S[],
  provider: readonly P[]
): MatchDiff {
  const storedById = new Map(stored.map((row) => [row.providerMatchId, row]));
  const providerIds = new Set(provider.map((row) => row.providerMatchId));

  let inserted = 0;
  let updated = 0;
  for (const row of provider) {
    const existing = storedById.get(row.providerMatchId);
    if (existing === undefined) {
      inserted += 1;
    } else if (rowChanged(existing, row)) {
      updated += 1;
    }
  }

  const removed = stored
    .filter((row) => !providerIds.has(row.providerMatchId))
    .map((row) => ({
      providerMatchId: row.providerMatchId,
      kickoffAt: row.kickoffAt.toISOString(),
      homeTeamName: row.homeTeamName,
      awayTeamName: row.awayTeamName,
    }))
    .sort((left, right) => left.providerMatchId - right.providerMatchId);

  return { counts: { inserted, updated, deleted: removed.length }, removed };
}

/**
 * A group team's identity: the group and the team together, as
 * `taso_group_teams_identity_idx` has it. Both sides are one season's.
 *
 * decisions/029-forced-season-refresh.md
 */
function groupTeamKey(row: DiffableGroupTeam): string {
  return `${row.groupId}:${row.teamProviderId}`;
}

export function diffGroupTeams<S extends DiffableGroupTeam, P extends DiffableGroupTeam>(
  stored: readonly S[],
  provider: readonly P[]
): GroupDiff {
  const storedByKey = new Map(stored.map((row) => [groupTeamKey(row), row]));
  const providerKeys = new Set(provider.map(groupTeamKey));

  let inserted = 0;
  let updated = 0;
  const deductionChanges: DeductionChange[] = [];

  for (const row of provider) {
    const existing = storedByKey.get(groupTeamKey(row));
    if (existing === undefined) {
      inserted += 1;
      continue;
    }
    if (rowChanged(existing, row)) updated += 1;
    // Reported even when the rest of the row is identical, and separately from
    // the count, because this is the field the feature exists for.
    if (existing.startingPoints !== row.startingPoints) {
      deductionChanges.push({
        teamName: row.teamName,
        from: existing.startingPoints,
        to: row.startingPoints,
      });
    }
  }

  const deleted = stored.filter((row) => !providerKeys.has(groupTeamKey(row))).length;

  return { counts: { inserted, updated, deleted }, deductionChanges };
}

/**
 * Byte-order comparison, not `localeCompare`: the sorts below canonicalise
 * input for a hash, which must come out the same on every machine.
 *
 * decisions/029-forced-season-refresh.md
 */
function byCodeUnit(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * Orders object keys and renders dates, so two structurally equal rows hash
 * the same however they were built.
 *
 * decisions/029-forced-season-refresh.md
 */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort(byCodeUnit)
        .map((key) => [key, canonical(source[key])])
    );
  }
  return value;
}

/**
 * A fingerprint of the provider rows a preview was built from. Row order does
 * not affect it; any changed value does.
 *
 * decisions/029-forced-season-refresh.md
 */
export function snapshotHash(rowGroups: readonly (readonly object[])[]): string {
  const hash = createHash("sha256");
  for (const rows of rowGroups) {
    const lines = rows.map((row) => JSON.stringify(canonical(row))).sort(byCodeUnit);
    hash.update(`${lines.length}\n`);
    for (const line of lines) hash.update(`${line}\n`);
  }
  return hash.digest("hex");
}
