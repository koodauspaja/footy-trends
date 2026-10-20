import { integrationDatabaseRefusal } from "../../src/lib/test-database-name";
import { integrationDatabaseUrl } from "./test-database";

/**
 * The integration suite's `globalSetup`: refuses the whole run, once and before
 * any test file loads, unless `DATABASE_URL` is exactly the database
 * `integrationDatabaseUrl` derives. The rule is in `src/lib/test-database-name.ts`.
 *
 * decisions/479-integration-suite-database-guard.md
 * decisions/674-e2e-on-an-empty-database.md
 */
export default function guardIntegrationDatabase(): void {
  const refusal = integrationDatabaseRefusal(process.env.DATABASE_URL, derived());
  if (refusal !== null) throw new Error(refusal);
}

function derived(): string | null {
  try {
    return integrationDatabaseUrl();
  } catch {
    // Nothing configured to derive it from; the refusal says what was found.
    return null;
  }
}
