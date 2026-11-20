/**
 * Whether a connection string names a test database, for the e2e analytics
 * override, and whether it is the integration suite's own. Imports nothing.
 *
 * decisions/304-test-database.md
 * decisions/479-integration-suite-database-guard.md
 * decisions/674-e2e-on-an-empty-database.md
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
  return namesDatabaseEndingIn(url, TEST_DATABASE_SUFFIX);
}

function namesDatabaseEndingIn(url: string | undefined, suffix: string): boolean {
  if (url === undefined) return false;

  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name.endsWith(suffix);
  } catch {
    // Unparseable is not a test database.
    return false;
  }
}

/**
 * Why the integration suite must not run against `actual`, or `null` when it
 * may: only when it is exactly `expected`, the database derived for the suite,
 * never one that merely looks like it.
 *
 * decisions/304-test-database.md
 * decisions/479-integration-suite-database-guard.md
 * decisions/674-e2e-on-an-empty-database.md
 */
export function integrationDatabaseRefusal(
  actual: string | undefined,
  expected: string | null
): string | null {
  if (expected !== null && sameDatabase(actual, expected)) return null;

  return (
    `Refusing to run the integration suite against ${describe(actual)}: it is not the ` +
    "suite's own database, and the suite creates and deletes rows. Run `npm run " +
    "test:integration`, which points it at that database."
  );
}

function sameDatabase(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  try {
    return new URL(actual).href === new URL(expected).href;
  } catch {
    // Unparseable is never the suite's database.
    return false;
  }
}

/**
 * A database URL parsed, or an error naming `what` and not the URL: Node's own
 * error carries the input, password included, to whatever prints it.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
export function parseDatabaseUrl(url: string, what: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`${what} is not a valid URL.`);
  }
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
