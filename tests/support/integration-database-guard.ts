import { integrationDatabaseRefusal } from "../../src/lib/test-database-name";

/**
 * The integration suite's `globalSetup` (#479): refuses the whole run, once and
 * before any test file loads, unless `DATABASE_URL` names a test database.
 *
 * The rule and its message live in `src/lib/test-database-name.ts`, where unit
 * tests reach them; this only acts on the answer.
 */
export default function guardIntegrationDatabase(): void {
  const refusal = integrationDatabaseRefusal(process.env);
  if (refusal !== null) throw new Error(refusal);
}
