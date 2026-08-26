import { describe, expect, it } from "vitest";
import {
  getGroupName,
  getStageName,
  listSeasonStages,
  parseStageParam,
  resolveCurrentStage,
  resolvePhaseShape,
} from "@/lib/cup-stages";

function staged(
  stage: string | null,
  overrides: Partial<{ status: string; kickoffAt: Date }> = {}
) {
  return {
    stage,
    status: overrides.status ?? "FINISHED",
    kickoffAt: overrides.kickoffAt ?? new Date("2025-01-01T00:00:00Z"),
  };
}

describe("stage names", () => {
  it("names every stage a Champions League season uses", () => {
    expect(getStageName("LEAGUE_STAGE")).toBe("Liigavaihe");
    expect(getStageName("GROUP_STAGE")).toBe("Lohkovaihe");
    expect(getStageName("PLAYOFFS")).toBe("Pudotuspelikarsinta");
    expect(getStageName("LAST_16")).toBe("Neljännesvälierät");
    expect(getStageName("QUARTER_FINALS")).toBe("Puolivälierät");
    expect(getStageName("SEMI_FINALS")).toBe("Välierät");
    expect(getStageName("FINAL")).toBe("Loppuottelu");
  });

  it("names the stages the World Cup adds, before that feature needs them", () => {
    expect(getStageName("LAST_32")).toBe("Kahdeksannesvälierät");
    expect(getStageName("THIRD_PLACE")).toBe("Pronssiottelu");
  });

  it("passes a genuinely unknown stage through rather than blanking it", () => {
    // A format change must be visible on the page, not silently empty or shown
    // under a Finnish label that is wrong.
    expect(getStageName("MYSTERY_ROUND")).toBe("MYSTERY_ROUND");
  });

  it("renders group names in Finnish", () => {
    expect(getGroupName("GROUP_A")).toBe("Lohko A");
    expect(getGroupName("GROUP_H")).toBe("Lohko H");
  });

  it("keeps the Finnish noun for an unrecognised group value", () => {
    // A heading must never be a bare provider token: it is user-facing, and
    // user-facing strings are Finnish.
    expect(getGroupName("SOMETHING_ELSE")).toBe("Lohko SOMETHING_ELSE");
    expect(getGroupName("1")).toBe("Lohko 1");
  });
});

describe("resolvePhaseShape", () => {
  it("reports a group stage as grouped", () => {
    expect(resolvePhaseShape([staged("GROUP_STAGE"), staged("LAST_16")])).toBe("grouped");
  });

  it("reports a league phase as single", () => {
    expect(resolvePhaseShape([staged("LEAGUE_STAGE"), staged("PLAYOFFS")])).toBe("single");
  });

  it("reports knockout-only data as having no table phase", () => {
    expect(resolvePhaseShape([staged("QUARTER_FINALS"), staged("FINAL")])).toBe("none");
  });

  it("reports league matches, which carry no stage at all, as none", () => {
    expect(resolvePhaseShape([staged(null), staged(null)])).toBe("none");
  });
});

describe("listSeasonStages", () => {
  it("orders stages by progression, not by the order the provider returned them", () => {
    const stages = listSeasonStages([
      staged("FINAL"),
      staged("LEAGUE_STAGE"),
      staged("SEMI_FINALS"),
      staged("PLAYOFFS"),
      staged("LEAGUE_STAGE"),
    ]);
    expect(stages).toEqual(["LEAGUE_STAGE", "PLAYOFFS", "SEMI_FINALS", "FINAL"]);
  });

  it("keeps an unrecognised stage, sorted last", () => {
    expect(listSeasonStages([staged("MYSTERY_ROUND"), staged("FINAL")])).toEqual([
      "FINAL",
      "MYSTERY_ROUND",
    ]);
  });

  it("breaks a rank tie between two unrecognised stages by name", () => {
    expect(listSeasonStages([staged("ZETA_ROUND"), staged("ALPHA_ROUND")])).toEqual([
      "ALPHA_ROUND",
      "ZETA_ROUND",
    ]);
  });

  it("ignores matches with no stage", () => {
    expect(listSeasonStages([staged(null), staged("FINAL")])).toEqual(["FINAL"]);
  });
});

describe("parseStageParam", () => {
  const available = ["LEAGUE_STAGE", "FINAL"];

  it("treats a missing or empty value as absent", () => {
    expect(parseStageParam(undefined, available)).toEqual({ kind: "absent" });
    expect(parseStageParam("", available)).toEqual({ kind: "absent" });
  });

  it("accepts a stage the season actually has", () => {
    expect(parseStageParam("FINAL", available)).toEqual({ kind: "valid", stage: "FINAL" });
  });

  it("rejects a stage the season does not have", () => {
    expect(parseStageParam("QUARTER_FINALS", available)).toEqual({ kind: "invalid" });
  });

  it("rejects a repeated query parameter", () => {
    expect(parseStageParam(["FINAL", "FINAL"], available)).toEqual({ kind: "invalid" });
  });

  it("rejects everything when the season has no stages", () => {
    expect(parseStageParam("FINAL", [])).toEqual({ kind: "invalid" });
  });
});

describe("resolveCurrentStage", () => {
  const available = ["LEAGUE_STAGE", "QUARTER_FINALS", "FINAL"];

  it("picks the stage of the earliest unplayed match", () => {
    const stage = resolveCurrentStage(
      [
        staged("LEAGUE_STAGE", { kickoffAt: new Date("2025-09-01T00:00:00Z") }),
        staged("FINAL", { status: "SCHEDULED", kickoffAt: new Date("2026-05-30T00:00:00Z") }),
        staged("QUARTER_FINALS", {
          status: "SCHEDULED",
          kickoffAt: new Date("2026-04-01T00:00:00Z"),
        }),
      ],
      available
    );
    expect(stage).toBe("QUARTER_FINALS");
  });

  it("falls back to the last stage once the season is complete", () => {
    const stage = resolveCurrentStage(
      [staged("LEAGUE_STAGE"), staged("QUARTER_FINALS"), staged("FINAL")],
      available
    );
    expect(stage).toBe("FINAL");
  });

  it("has no current stage when the season has none", () => {
    expect(resolveCurrentStage([], [])).toBeUndefined();
  });
});
