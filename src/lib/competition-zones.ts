/**
 * What the positions of a group's table lead to, from the levels TASO
 * publishes for it: the zones named under the table and the rules drawn in it.
 *
 * decisions/063-competition-zones.md
 */

/**
 * One level as stored: the places it takes, and its label when it has one.
 */
export type ZoneLevel = {
  level: number;
  teamCount: number;
  label: string | null;
};

/**
 * A labelled stretch of the table, by the first and last position it covers.
 */
export type Zone = {
  from: number;
  to: number;
  label: string;
};

export type GroupZones = {
  zones: Zone[];
  /** The positions a heavier rule is drawn under: where one level ends and another row follows. */
  ruleAfter: number[];
};

const NO_ZONES: GroupZones = { zones: [], ruleAfter: [] };

/**
 * A group's zones on a table of `rowCount` rows. Positions are handed out from
 * the top in level order, an unlabelled level included; a group with no
 * labelled level on the table has neither zones nor rules.
 */
export function groupZones(levels: readonly ZoneLevel[], rowCount: number): GroupZones {
  const zones: Zone[] = [];
  const ruleAfter: number[] = [];
  let taken = 0;

  for (const level of levels.toSorted((left, right) => left.level - right.level)) {
    if (taken >= rowCount) break;
    const from = taken + 1;
    const to = Math.min(taken + level.teamCount, rowCount);
    if (level.label !== null) zones.push({ from, to, label: level.label });
    if (to < rowCount) ruleAfter.push(to);
    taken = to;
  }

  return zones.length === 0 ? NO_ZONES : { zones, ruleAfter };
}

/**
 * A zone's line under the table: `Sija 1: …` for one position, `Sijat 3–8: …`
 * for several, then TASO's label as written.
 */
export function zoneLine(zone: Zone): string {
  const positions = zone.from === zone.to ? `Sija ${zone.from}` : `Sijat ${zone.from}–${zone.to}`;
  return `${positions}: ${zone.label}`;
}
