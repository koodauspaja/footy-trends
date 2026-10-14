/**
 * The largest value an id or a season can have: each is stored in a Postgres
 * `integer` column, which is 32-bit.
 *
 * decisions/020-context-free-team-page.md
 */
export const MAX_STORED_INTEGER = 2_147_483_647;

/**
 * Whether a value can be stored in, and therefore compared against, our columns.
 *
 * decisions/020-context-free-team-page.md
 */
export function isStoredInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_STORED_INTEGER;
}

const DECIMAL_DIGITS = /^\d+$/;

/**
 * The whole number a piece of text spells, or `null` when it spells none our
 * columns could hold: the one parser for text from outside. Decimal digits and
 * nothing else; zero is a whole number here.
 *
 * decisions/529-one-whole-number-parser.md
 */
export function parseWholeNumber(raw: unknown): number | null {
  if (typeof raw !== "string" || !DECIMAL_DIGITS.test(raw)) return null;
  const value = Number(raw);
  return isStoredInteger(value) ? value : null;
}
