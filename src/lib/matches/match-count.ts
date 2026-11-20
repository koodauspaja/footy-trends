/**
 * `1 ottelu`, `10 ottelua`: a count of matches, which Finnish says one way for
 * one and another for every other number. The one copy of the rule.
 *
 * decisions/017-huuhkajat.md
 * decisions/036-halftime-comebacks.md
 * decisions/698-long-lists-start-closed.md
 */
export function matchCountLabel(count: number): string {
  return count === 1 ? "1 ottelu" : `${count} ottelua`;
}
