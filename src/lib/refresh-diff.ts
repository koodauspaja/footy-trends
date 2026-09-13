import { createHash } from "node:crypto";
import type { DeductionChange, RemovedMatch, RowCounts } from "./refresh-view";

/**
 * The pure half of the forced refresh, from specs/029-forced-season-refresh.md:
 * what would change if this provider answer were applied to these stored rows.
 *
 * Pure on purpose, and separate from `force-refresh.ts`, because this is the
 * part the confirmation dialog shows an admin *and* the part the run log
 * records. Computing it once means what was approved and what is recorded are
 * the same numbers by construction rather than by two pieces of code agreeing.
 *
 * Nothing here reads a database or a provider. It takes rows and returns
 * counts.
 */

/** The stored-match fields this module needs to name a removal. */
export type DiffableStoredMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

export type DiffableProviderMatch = {
  providerMatchId: number;
};

/** The group-team fields the identity and the deduction are read from. */
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
 * Whether two stored values differ.
 *
 * `Date` needs its own case: two `Date` objects for the same instant are never
 * `===`, so without this every match would read as changed on every run and the
 * confirmation dialog would be worthless.
 */
function valuesDiffer(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() !== right.getTime();
  if (left instanceof Date || right instanceof Date) return true;
  return left !== right;
}

/**
 * Whether applying `provider` to `stored` would change anything.
 *
 * Driven by the provider row's own keys rather than a hand-written column list.
 * Both normalized provider types mirror their table's columns exactly — that is
 * stated in `schema.ts` and is what lets a selected row satisfy the provider
 * type structurally — so the provider row's keys *are* the columns the upsert
 * writes. A hand-written list would be a second thing to keep true, and the
 * column it silently missed would be a change the admin was never shown.
 */
function rowChanged(stored: object, provider: object): boolean {
  const storedValues = stored as Record<string, unknown>;
  const providerValues = provider as Record<string, unknown>;
  return Object.keys(providerValues).some((key) =>
    valuesDiffer(storedValues[key], providerValues[key])
  );
}

/**
 * Matches are keyed by `providerMatchId`, which is the unique index on both
 * match tables.
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
 * A group team's identity, matching `taso_group_teams_identity_idx`: the group
 * and the team together, since there is no provider-side row id to key on.
 *
 * Scoped per season already — both sides are read for one season — so the
 * category, competition and season are not repeated here.
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
 * Orders object keys and renders dates, so two structurally equal rows hash
 * the same however they were built.
 */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])])
    );
  }
  return value;
}

/**
 * A fingerprint of the provider rows a preview was built from.
 *
 * The apply recomputes this and refuses when it no longer matches, so an admin
 * can never approve one diff and have another applied — the provider answering
 * differently between the two steps stops the write instead of silently
 * changing it.
 *
 * Row order does not affect it (the provider is under no obligation to keep
 * one) but any changed value does. Each group is length-prefixed and hashed
 * separately, so matches and group teams cannot be swapped for each other.
 */
export function snapshotHash(rowGroups: readonly (readonly object[])[]): string {
  const hash = createHash("sha256");
  for (const rows of rowGroups) {
    const lines = rows.map((row) => JSON.stringify(canonical(row))).sort();
    hash.update(`${lines.length}\n`);
    for (const line of lines) hash.update(`${line}\n`);
  }
  return hash.digest("hex");
}
