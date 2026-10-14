/**
 * The database's connection string, or an error that says what is missing.
 * There is no fallback, on purpose, and empty counts as unset.
 *
 * decisions/536-database-url-required.md
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
