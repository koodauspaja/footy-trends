/**
 * The database's connection string, or an error that says what is missing
 * (#536).
 *
 * **There is no fallback, on purpose.** Handed nothing, postgres.js connects by
 * its own defaults: `localhost`, or whatever `PGHOST` and the other `PG*`
 * variables happen to hold. The app then starts and every query fails as an
 * error page; a migration is worse, because a stray `PGHOST` in someone's shell
 * decides which database it changes. An unset or empty variable is refused
 * here, by name, before any client exists to fall back with.
 *
 * Empty counts as unset: `DATABASE_URL=` in an `.env` copied from the example
 * is the usual way to have neither.
 */
export const MISSING_DATABASE_URL =
  "DATABASE_URL is not set, or is empty. Set it to the database's connection string.";

export function requireDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const url = env.DATABASE_URL?.trim() ?? "";
  if (url === "") throw new Error(MISSING_DATABASE_URL);
  return url;
}
