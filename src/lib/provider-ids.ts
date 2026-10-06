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
 * which rendered the match-loading-failed message before this existed.
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

const DECIMAL_DIGITS = /^\d+$/;

/**
 * The whole number a piece of text spells, or `null` when it spells none our
 * columns could hold: the one parser for a route id, a query parameter, or any
 * other text from outside (#529).
 *
 * Decimal digits and nothing else. `Number()` alone reads `"0x10"` as 16,
 * `"1e3"` as 1000, `""` and `" "` as 0 and `" 7 "` as 7, so
 * `/kotimaa/joukkue/0x10` showed team 16. The digits rule out a sign and a
 * fraction; `isStoredInteger` rules out a value past the column, three hundred
 * digits that parse to `Infinity` included. A repeated query parameter arrives
 * as an array and is no number either.
 *
 * Zero is a whole number here. A caller that needs at least 1, a round or a
 * page, says so itself.
 */
export function parseWholeNumber(raw: unknown): number | null {
  if (typeof raw !== "string" || !DECIMAL_DIGITS.test(raw)) return null;
  const value = Number(raw);
  return isStoredInteger(value) ? value : null;
}
