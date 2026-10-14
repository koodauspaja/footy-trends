import { integrationDatabaseRefusal } from "../../src/lib/test-database-name";

/**
 * The integration suite's `globalSetup`: refuses the whole run, once and before
 * any test file loads, unless `DATABASE_URL` names a test database. The rule
 * is in `src/lib/test-database-name.ts`.
 *
 * decisions/479-integration-suite-database-guard.md
 */
export default function guardIntegrationDatabase(): void {
  const refusal = integrationDatabaseRefusal(process.env);
  if (refusal !== null) throw new Error(refusal);
}
