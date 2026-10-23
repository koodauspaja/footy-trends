/**
 * The order a domestic standings page shows a season's groups in: a league's
 * later phases before its first, and a cup's latest round first, the one
 * that starts open.
 *
 * decisions/714-page-section-order.md
 * decisions/698-long-lists-start-closed.md
 */

type Group = { groupId: number; kind: string };
type Dated = { groupId: number; kickoffAt: Date };

/**
 * A league's groups: the tables, later phases first and the first phase last,
 * then the match lists in TASO's order.
 *
 * decisions/714-page-section-order.md
 */
export function leagueGroupOrder<G extends Group>(
  groups: readonly G[],
  matches: readonly Dated[]
): G[] {
  const tables = groups.filter((group) => group.kind !== "match-list");
  const lists = groups.filter((group) => group.kind === "match-list");
  const [first = [], ...later] = phases(tables, matches);
  return [...later.flat(), ...first, ...lists];
}

/**
 * A cup's groups: its match lists by the Helsinki day each first plays, latest first,
 * then any group tables in TASO's order. Rounds start on days of their own, so
 * they read latest first; a group stage starting on one day keeps TASO's order.
 *
 * decisions/714-page-section-order.md
 */
export function cupGroupOrder<G extends Group>(
  groups: readonly G[],
  matches: readonly Dated[]
): G[] {
  const startOf = startDays(matches);
  // `toSorted` is stable, so lists starting on one day keep TASO's order.
  const lists = groups
    .filter((group) => group.kind === "match-list")
    .toSorted((left, right) => startOf(right).localeCompare(startOf(left)));
  const tables = groups.filter((group) => group.kind !== "match-list");
  return [...lists, ...tables];
}

/**
 * The groups of a cup that start open: the match lists starting on the day the
 * latest one does, so a final and a third-place match played that day open
 * together. A cup with no match list opens its tables.
 *
 * decisions/698-long-lists-start-closed.md
 */
export function openCupGroups(groups: readonly Group[], matches: readonly Dated[]): Set<number> {
  const startOf = startDays(matches);
  const lists = groups.filter((group) => group.kind === "match-list");
  if (lists.length === 0) return new Set(groups.map((group) => group.groupId));
  const latest = lists.map(startOf).reduce((day, next) => (next > day ? next : day));
  return new Set(lists.filter((group) => startOf(group) === latest).map((group) => group.groupId));
}

/**
 * The Helsinki day each group's first match is played on, read per group. A
 * group with no dated match reads "", which sorts after every day.
 *
 * decisions/714-page-section-order.md
 * decisions/698-long-lists-start-closed.md
 */
function startDays(matches: readonly Dated[]): (group: Group) => string {
  const firstDay = new Map<number, string>();
  for (const match of matches) {
    const day = helsinkiDay.format(match.kickoffAt);
    const earliest = firstDay.get(match.groupId);
    if (earliest === undefined || day < earliest) firstDay.set(match.groupId, day);
  }
  return (group) => firstDay.get(group.groupId) ?? "";
}

// `2026-03-14`: the Helsinki calendar day the match lists' date column shows,
// in a form that sorts as text.
const helsinkiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Groups in TASO's order, split into phases: a phase ends where the next group
 * starts after every group so far has ended. A group with no dated match stays
 * in the phase it sits in.
 *
 * decisions/714-page-section-order.md
 */
function phases<G extends Group>(groups: readonly G[], matches: readonly Dated[]): G[][] {
  const spans = new Map<number, { first: number; last: number }>();
  for (const match of matches) {
    const time = match.kickoffAt.getTime();
    const span = spans.get(match.groupId);
    spans.set(match.groupId, {
      first: Math.min(span?.first ?? time, time),
      last: Math.max(span?.last ?? time, time),
    });
  }

  const result: G[][] = [];
  let endedBy: number | null = null;
  for (const group of groups) {
    const span = spans.get(group.groupId);
    const startsPhase = span !== undefined && endedBy !== null && span.first > endedBy;
    const current = result.at(-1);
    if (current === undefined || startsPhase) result.push([group]);
    else current.push(group);
    if (span !== undefined) endedBy = Math.max(endedBy ?? span.last, span.last);
  }
  return result;
}
