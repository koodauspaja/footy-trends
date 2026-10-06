/**
 * The decisions a backfill makes, separated from the I/O that carries them out:
 * which competition-seasons get fetched, how fast, and whether a destructive
 * reset may proceed.
 *
 * decisions/169-production-backfill.md
 */

/**
 * One unit of work: a single provider request pair for one competition-season.
 *
 * decisions/169-production-backfill.md
 */
export type TasoTarget = {
  code: string;
  competitionId: string;
  categoryId: string;
  seasonId: number;
};

/**
 * Seasons for one TASO competition, newest first, from its own floor up to the
 * current season.
 *
 * decisions/169-production-backfill.md
 */
export function tasoSeasonsFor(earliestSeason: number, currentSeason: number): number[] {
  if (currentSeason < earliestSeason) return [];
  const seasons: number[] = [];
  for (let season = currentSeason; season >= earliestSeason; season -= 1) seasons.push(season);
  return seasons;
}

/**
 * The database name in a connection string, for display and for the reset
 * guard. Never returns anything from the credentials portion.
 *
 * decisions/169-production-backfill.md
 */
export function databaseNameFrom(connectionString: string): string | null {
  try {
    const { pathname } = new URL(connectionString);
    const raw = pathname.replace(/^\//, "");
    if (raw === "") return null;
    // Decoded, because the pathname is percent-encoded and the operator types
    // the real name. Without this a database called `footy trends` displays as
    // `footy%20trends` and refuses the confirmation that was correct.
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

/**
 * Host and database only: a connection string must never reach a log.
 *
 * decisions/169-production-backfill.md
 */
export function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.host}/${databaseNameFrom(connectionString) ?? "(no database)"}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export type ResetVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Whether a reset may proceed. A flag is not enough: the operator has to name
 * the database, and the name has to match.
 *
 * decisions/169-production-backfill.md
 */
export function authoriseReset(
  connectionString: string,
  confirmedName: string | null
): ResetVerdict {
  const actual = databaseNameFrom(connectionString);
  if (actual === null) return { allowed: false, reason: "DATABASE_URL names no database" };
  if (confirmedName === null || confirmedName === "") {
    return {
      allowed: false,
      reason: `--reset needs the database name to confirm: --reset=${actual}`,
    };
  }
  if (confirmedName !== actual) {
    return {
      allowed: false,
      reason: `--reset=${confirmedName} does not match the target database (${actual})`,
    };
  }
  return { allowed: true };
}

/**
 * The useful sentence out of a driver error: postgres-js puts the reason in
 * `cause` and the whole failed statement in `message`.
 *
 * decisions/169-production-backfill.md
 */
export function describeError(error: unknown, maxLength = 200): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message !== "") return cause.message;
  return error.message.length > maxLength ? `${error.message.slice(0, maxLength)}…` : error.message;
}

/**
 * Whether a competition-season can be skipped on a re-run: it must already
 * hold rows, and be older than the season currently being played.
 *
 * decisions/169-production-backfill.md
 */
export function canSkip(storedRows: number, seasonId: number, currentSeason: number): boolean {
  return storedRows > 0 && seasonId < currentSeason;
}
