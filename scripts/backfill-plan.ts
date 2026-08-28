/**
 * The decisions a backfill makes, separated from the I/O that carries them out.
 *
 * Everything here is pure so it can be tested: which competition-seasons get
 * fetched, how fast, and whether a destructive reset is allowed to proceed.
 * `backfill.ts` does the talking to providers and the database.
 */

/** One unit of work: a single provider request pair for one competition-season. */
export type TasoTarget = {
  code: string;
  competitionId: string;
  categoryId: string;
  seasonId: number;
};

/**
 * Seasons for one TASO competition, newest first, from its own floor up to the
 * current season. Each competition has a different floor — Ykkösliiga did not
 * exist before 2024 — so asking every competition for every season since 2015
 * would spend hundreds of requests on seasons that never happened.
 */
export function tasoSeasonsFor(earliestSeason: number, currentSeason: number): number[] {
  if (currentSeason < earliestSeason) return [];
  const seasons: number[] = [];
  for (let season = currentSeason; season >= earliestSeason; season -= 1) seasons.push(season);
  return seasons;
}

/**
 * Milliseconds to wait before the next request so that requests are spaced at
 * least `minIntervalMs` apart. Zero when enough time has already passed —
 * database writes between requests are not free, and charging for time already
 * spent would make a 344-request run considerably longer than it needs to be.
 */
export function delayBefore(
  lastRequestAt: number | null,
  now: number,
  minIntervalMs: number
): number {
  if (lastRequestAt === null) return 0;
  return Math.max(0, minIntervalMs - (now - lastRequestAt));
}

/** Requests per minute -> the gap to leave between them. */
export function intervalForRatePerMinute(perMinute: number): number {
  if (perMinute <= 0) throw new Error(`Rate must be positive, got ${perMinute}`);
  return Math.ceil(60_000 / perMinute);
}

/**
 * The database name in a connection string, for display and for the reset
 * guard. Never returns anything from the credentials portion.
 */
export function databaseNameFrom(connectionString: string): string | null {
  try {
    const { pathname } = new URL(connectionString);
    const name = pathname.replace(/^\//, "");
    return name === "" ? null : name;
  } catch {
    return null;
  }
}

/** Host and database only — a connection string must never reach a log. */
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
 * A reset empties every table in whatever database `DATABASE_URL` points at,
 * which in the intended use is production. So it is not enough to pass a flag:
 * the operator has to name the database, and the name has to match. Typing the
 * wrong name is the mistake this catches — a `--reset` on a shell that still
 * has yesterday's `DATABASE_URL` exported.
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
 * The useful sentence out of a driver error.
 *
 * postgres-js puts the whole failed statement in `message` and the actual
 * reason in `cause`. A backfill inserting a season at a time produces
 * statements thousands of parameters long, so printing `message` buries the one
 * line that says what went wrong under 20KB of `$3791, $3792, ...`.
 */
export function describeError(error: unknown, maxLength = 200): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message !== "") return cause.message;
  return error.message.length > maxLength ? `${error.message.slice(0, maxLength)}…` : error.message;
}
