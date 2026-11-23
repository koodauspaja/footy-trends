/**
 * Which groups continue another's table, and the points they carry over from it.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

/**
 * One carry-over: this group continues its parent's points, so both groups'
 * matches are fed to `calculateStandings`.
 *
 * decisions/013-more-finnish-competitions.md
 */
export type CarryOverEntry = {
  parent: number;
  /**
   * What TASO's `starting_points` means for this group. `true` (2015-2024): the
   * team's points in the parent, a seed. `false` (2025 on): 0 or a deduction, with
   * the parent's results already in the child's points.
   */
  seeded: boolean;
};

/**
 * Every carry-over, keyed by category, then season, then group. A test checks
 * each entry against TASO's published standings.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/127-carry-over-config-validation.md
 * decisions/133-split-group-round-numbering.md
 * decisions/272-group-standings-endpoint.md
 */
export const CARRY_OVER_CONFIG: Record<string, Record<string, Record<number, CarryOverEntry>>> = {
  BTSM: {
    spljp15: { 3: { parent: 1, seeded: true }, 4: { parent: 2, seeded: true } },
  },
  M1: {
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    /** Group 3 carries a −3 `starting_points` deduction. */
    spljp26: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
  },
  M1L: {
    spljp24: { 2: { parent: 1, seeded: false } },
  },
  M2: {
    spljp19: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
    },
    spljp22: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
    },
    spljp24: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
      7: { parent: 1, seeded: true },
      8: { parent: 2, seeded: true },
      9: { parent: 3, seeded: true },
    },
    spljp25: {
      4: { parent: 1, seeded: false },
      5: { parent: 2, seeded: false },
      6: { parent: 3, seeded: false },
      7: { parent: 1, seeded: false },
      8: { parent: 2, seeded: false },
      9: { parent: 3, seeded: false },
    },
    spljp26: {
      4: { parent: 1, seeded: false },
      5: { parent: 2, seeded: false },
      6: { parent: 3, seeded: false },
      7: { parent: 1, seeded: false },
      8: { parent: 2, seeded: false },
      9: { parent: 3, seeded: false },
    },
  },
  N1: {
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false } },
    spljp26: { 2: { parent: 1, seeded: false } },
  },
  NL: {
    spljp15: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp16: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp17: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp18: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp19: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false } },
    spljp26: { 2: { parent: 1, seeded: false } },
  },
  VL: {
    spljp19: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    /** TASO reports `starting_points` 0 for both groups, with the parent already in `points`. */
    spljp26: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
  },
};

/**
 * Every configured carry-over, flattened to one entry per `competitionId` and
 * `groupId`, for the test that checks each against TASO's published standings.
 *
 * decisions/127-carry-over-config-validation.md
 */
export function listCarryOverEntries(): {
  categoryId: string;
  competitionId: string;
  groupId: number;
}[] {
  return Object.entries(CARRY_OVER_CONFIG).flatMap(([categoryId, competitions]) =>
    Object.entries(competitions).flatMap(([competitionId, groups]) =>
      Object.keys(groups).map((groupId) => ({
        categoryId,
        competitionId,
        groupId: Number(groupId),
      }))
    )
  );
}

export function carryOverEntry(
  categoryId: string,
  competitionId: string,
  groupId: number
): CarryOverEntry | null {
  return CARRY_OVER_CONFIG[categoryId]?.[competitionId]?.[groupId] ?? null;
}

export function parentGroupId(
  categoryId: string,
  competitionId: string,
  groupId: number
): number | null {
  return carryOverEntry(categoryId, competitionId, groupId)?.parent ?? null;
}

/**
 * Whether any group of a category's season carries points over from another:
 * the season split.
 *
 * decisions/061-season-simulation.md
 */
export function hasCarryOver(categoryId: string, competitionId: string): boolean {
  return CARRY_OVER_CONFIG[categoryId]?.[competitionId] !== undefined;
}
