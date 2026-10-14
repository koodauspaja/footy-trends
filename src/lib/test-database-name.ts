/**
 * Whether a connection string names a test database: the one rule both the
 * e2e analytics override and the integration suite's guard apply. Imports
 * nothing.
 *
 * decisions/304-test-database.md
 * decisions/479-integration-suite-database-guard.md
 */

/**
 * The suffix every test database carries, as `tests/support/test-database.ts` derives it.
 *
 * decisions/304-test-database.md
 * decisions/479-integration-suite-database-guard.md
 */
const TEST_DATABASE_SUFFIX = "_test";

/**
 * `postgres://…/footy-trends_test` is a test database; `…/footy-trends` is not,
 * and neither is a name that merely contains `_test`, a URL naming no
 * database, or one that cannot be parsed.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/479-integration-suite-database-guard.md
 */
export function namesTestDatabase(url: string | undefined): boolean {
  if (url === undefined) return false;

  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name.endsWith(TEST_DATABASE_SUFFIX);
  } catch {
    // Unparseable is not a test database.
    return false;
  }
}

/**
 * Why the integration suite must not run against this environment's database,
 * or `null` when it may. A `DATABASE_URL` equal to `TEST_DATABASE_URL` is
 * allowed.
 *
 * decisions/304-test-database.md
 * decisions/479-integration-suite-database-guard.md
 */
export function integrationDatabaseRefusal(env: NodeJS.Dict<string>): string | null {
  const url = env.DATABASE_URL;
  if (namesTestDatabase(url)) return null;

  const override = (env.TEST_DATABASE_URL ?? "").trim();
  if (override !== "" && url === override) return null;

  return (
    `Refusing to run the integration suite against ${describe(url)}: it is not a test ` +
    "database, and the suite creates and deletes rows. Run `npm run test:integration`, " +
    "which points it at the test database."
  );
}

/**
 * The database a URL names, without its credentials: enough to recognise,
 * nothing to leak.
 *
 * decisions/479-integration-suite-database-guard.md
 */
function describe(url: string | undefined): string {
  if (url === undefined || url.trim() === "") return "no DATABASE_URL at all";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "an unparseable DATABASE_URL";
  }
}
