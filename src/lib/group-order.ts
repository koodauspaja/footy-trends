/**
 * The order a domestic standings page shows a season's groups in: a league's
 * later phases before its first, and a cup's latest round first.
 *
 * decisions/714-page-section-order.md
 */

type Group = { groupId: number; kind: string };
type Dated = { groupId: number; kickoffAt: Date };

/**
 * A league's groups: the tables, later phases first and the first phase last,
 * then the match lists in TASO's order. The first phase is every group before
 * the first one that starts after all of them have ended.
 *
 * decisions/714-page-section-order.md
 */
export function leagueGroupOrder<G extends Group>(
  groups: readonly G[],
  matches: readonly Dated[]
): G[] {
  const tables = groups.filter((group) => group.kind !== "match-list");
  const lists = groups.filter((group) => group.kind === "match-list");
  return [...laterPhasesFirst(tables, matches), ...lists];
}

/**
 * A cup's groups: its rounds latest first, then any group tables in TASO's order.
 *
 * decisions/714-page-section-order.md
 */
export function cupGroupOrder<G extends Group>(groups: readonly G[]): G[] {
  const rounds = groups.filter((group) => group.kind === "match-list").reverse();
  const tables = groups.filter((group) => group.kind !== "match-list");
  return [...rounds, ...tables];
}

function laterPhasesFirst<G extends Group>(groups: readonly G[], matches: readonly Dated[]): G[] {
  const spans = new Map<number, { first: number; last: number }>();
  for (const match of matches) {
    const time = match.kickoffAt.getTime();
    const span = spans.get(match.groupId);
    spans.set(match.groupId, {
      first: Math.min(span?.first ?? time, time),
      last: Math.max(span?.last ?? time, time),
    });
  }

  // A group with no dated match neither starts a later phase nor ends the first.
  let endedBy = Number.NEGATIVE_INFINITY;
  for (const [index, group] of groups.entries()) {
    const span = spans.get(group.groupId) ?? { first: endedBy, last: endedBy };
    if (index > 0 && span.first > endedBy) {
      return [...groups.slice(index), ...groups.slice(0, index)];
    }
    endedBy = Math.max(endedBy, span.last);
  }
  return [...groups];
}
