import { describe, expect, it } from "vitest";
import { groupZones, zoneLine } from "@/lib/competition-zones";

/**
 * A group's zones from its stored levels: which positions each label covers,
 * where the rules go, and how a zone is worded.
 *
 * decisions/063-competition-zones.md
 */

function level(number: number, teamCount: number, label: string | null) {
  return { level: number, teamCount, label };
}

// Ykkösliiga 2026 as TASO publishes it: `1,1,6,0,1,1`, the fourth level empty.
const YKKOSLIIGA = [
  level(1, 1, "Nousee Veikkausliigaan"),
  level(2, 1, "Jatkaa liigakarsintaan"),
  level(3, 6, "Säilyy Ykkösliigassa"),
  level(5, 1, "Karsii paikastaan Ykkösliigassa"),
  level(6, 1, "Putoaa Ykköseen"),
];

describe("groupZones", () => {
  it("hands positions out from the top in level order", () => {
    expect(groupZones(YKKOSLIIGA, 10).zones).toEqual([
      { from: 1, to: 1, label: "Nousee Veikkausliigaan" },
      { from: 2, to: 2, label: "Jatkaa liigakarsintaan" },
      { from: 3, to: 8, label: "Säilyy Ykkösliigassa" },
      { from: 9, to: 9, label: "Karsii paikastaan Ykkösliigassa" },
      { from: 10, to: 10, label: "Putoaa Ykköseen" },
    ]);
  });

  it("draws a rule under the last row of every level but the one that ends the table", () => {
    expect(groupZones(YKKOSLIIGA, 10).ruleAfter).toEqual([1, 2, 8, 9]);
  });

  it("orders the levels by their number, however they were read", () => {
    expect(groupZones(YKKOSLIIGA.toReversed(), 10)).toEqual(groupZones(YKKOSLIIGA, 10));
  });

  it("counts an unlabelled level's places without naming them", () => {
    // Veikkausliiga 2026's Karsintasarja: `0,0,0,4,1,1`.
    const karsintasarja = [
      level(4, 4, null),
      level(5, 1, "Liigakarsintaan"),
      level(6, 1, "Ykkösliigaan"),
    ];

    expect(groupZones(karsintasarja, 6)).toEqual({
      zones: [
        { from: 5, to: 5, label: "Liigakarsintaan" },
        { from: 6, to: 6, label: "Ykkösliigaan" },
      ],
      ruleAfter: [4, 5],
    });
  });

  it("rules off an unlabelled level that follows the labelled ones", () => {
    // Veikkausliiga 2026's Mestaruussarja: `1,1,1,3`.
    const mestaruussarja = [
      level(1, 1, "Kultaa"),
      level(2, 1, "Hopeaa"),
      level(3, 1, "Pronssia"),
      level(4, 3, null),
    ];

    expect(groupZones(mestaruussarja, 6).ruleAfter).toEqual([1, 2, 3]);
  });

  it("leaves the rows past the counts without a zone, under a rule", () => {
    const short = [level(1, 2, "Nousee"), level(2, 1, "Karsii")];

    expect(groupZones(short, 6)).toEqual({
      zones: [
        { from: 1, to: 2, label: "Nousee" },
        { from: 3, to: 3, label: "Karsii" },
      ],
      ruleAfter: [2, 3],
    });
  });

  it("cuts a level at the last row when the counts run past the table", () => {
    const long = [level(1, 2, "Nousee"), level(2, 6, "Säilyy"), level(3, 2, "Putoaa")];

    expect(groupZones(long, 5)).toEqual({
      zones: [
        { from: 1, to: 2, label: "Nousee" },
        { from: 3, to: 5, label: "Säilyy" },
      ],
      ruleAfter: [2],
    });
  });

  it("draws nothing for a group with no labelled level", () => {
    expect(groupZones([level(1, 2, null), level(2, 4, null)], 6)).toEqual({
      zones: [],
      ruleAfter: [],
    });
  });

  it("draws nothing when the only labelled level lies past the table", () => {
    expect(groupZones([level(1, 4, null), level(2, 1, "Putoaa")], 4)).toEqual({
      zones: [],
      ruleAfter: [],
    });
  });

  it("draws nothing for a group with no levels or no rows", () => {
    expect(groupZones([], 10)).toEqual({ zones: [], ruleAfter: [] });
    expect(groupZones(YKKOSLIIGA, 0)).toEqual({ zones: [], ruleAfter: [] });
  });
});

describe("zoneLine", () => {
  it("says Sija for a single position", () => {
    expect(zoneLine({ from: 1, to: 1, label: "Nousee Veikkausliigaan" })).toBe(
      "Sija 1: Nousee Veikkausliigaan"
    );
  });

  it("says Sijat with an en dash for several", () => {
    expect(zoneLine({ from: 3, to: 8, label: "Säilyy Ykkösliigassa" })).toBe(
      "Sijat 3–8: Säilyy Ykkösliigassa"
    );
  });

  it("keeps the label as TASO wrote it", () => {
    expect(zoneLine({ from: 4, to: 5, label: "Säilyy / Putoaa" })).toBe(
      "Sijat 4–5: Säilyy / Putoaa"
    );
  });
});
