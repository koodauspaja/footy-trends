/**
 * Whether a connection string names a test database — the one rule both the
 * e2e analytics override and the integration suite's guard apply (#479).
 *
 * Imports nothing, like `e2e-analytics.ts`, which reads it: Playwright and the
 * Vitest config both load this without a server around them.
 */

/** The suffix every test database carries, as `tests/support/test-database.ts` derives it (#304). */
const TEST_DATABASE_SUFFIX = "_test";

/**
 * `postgres://…/footy-trends_test` is a test database; `…/footy-trends` is not,
 * and neither is a name that merely *contains* `_test`, a URL naming no
 * database, or one that cannot be parsed.
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
 * or `null` when it may (#479).
 *
 * `npm run test:integration` goes through `scripts/with-test-db.ts`, which sets
 * `DATABASE_URL` to the test database; running Vitest on the suite directly
 * leaves `.env`'s development `DATABASE_URL` in place instead — which is how
 * the suite once wrote fixture rows into a developer's own database.
 *
 * `TEST_DATABASE_URL` is #304's documented override "where the derivation is
 * wrong", and such a database need not end in `_test`. Naming it explicitly is
 * a decision, not the accident this guards against, so a `DATABASE_URL` equal
 * to it is allowed.
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

/** The database a URL names, without its credentials — enough to recognise, nothing to leak. */
function describe(url: string | undefined): string {
  if (url === undefined || url.trim() === "") return "no DATABASE_URL at all";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "an unparseable DATABASE_URL";
  }
}
