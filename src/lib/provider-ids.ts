/**
 * Every id and season this app stores lives in a Postgres `integer` column,
 * which is 32-bit.
 *
 * A larger value is not merely absent from the table: `postgres.js` binds the
 * parameter as an `int4`, so the query fails at bind time with "integer out of
 * range" and the page shows its error state — telling a reader that something
 * broke when what actually happened is that they asked for a team, match or
 * season that cannot exist. Measured on `/kotimaa/joukkue/99999999999`,
 * `/kotimaa/ottelu/99999999999` and `?kausi=9007199254740991`, all three of
 * which rendered "Otteluiden lataaminen epäonnistui." before this existed.
 *
 * Note the raw SQL is fine — Postgres promotes the column to `bigint` when it
 * compares against a literal that large. Only the bound parameter fails, which
 * is why this cannot be left to the database to answer.
 */
export const MAX_STORED_INTEGER = 2_147_483_647;

/** Whether a value can be stored in, and therefore compared against, our columns. */
export function isStoredInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_STORED_INTEGER;
}
