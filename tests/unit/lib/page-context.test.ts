import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBasePageContext } from "@/lib/page-context";

const { getSeasonContext, getViewerPreferences } = vi.hoisted(() => ({
  getSeasonContext: vi.fn(),
  getViewerPreferences: vi.fn<() => Promise<unknown>>(async () => null),
}));

vi.mock("@/lib/football-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/football-data")>();
  return { ...actual, getSeasonContext };
});
vi.mock("@/lib/viewer", () => ({ getViewerPreferences }));

const SEASON_CONTEXT = {
  activeSeasonId: 2026,
  selectableSeasons: [{ seasonId: 2026, label: "2026" }],
  spansCalendarYears: true,
};

function preferences(overrides: Partial<Record<string, string | null>> = {}) {
  return {
    defaultRegion: null,
    defaultCompetitionDomestic: null,
    defaultCompetitionForeign: null,
    defaultCompetitionNational: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSeasonContext.mockResolvedValue(SEASON_CONTEXT);
  getViewerPreferences.mockResolvedValue(null);
});

describe("a reader's stored competition default", () => {
  /**
   * One shape — stored preferences plus a URL, resolved for a region — so the
   * precedence rules read as a table instead of six near-identical tests.
   *
   * URL > team context > preference > the region's hardcoded default. The team
   * context rung has its own test below, because it takes a third argument.
   */
  it.each([
    [
      "the foreign competition they chose",
      { defaultCompetitionForeign: "BL1" },
      {},
      "foreign",
      "BL1",
    ],
    [
      "the national competition they chose",
      { defaultCompetitionNational: "EC" },
      {},
      "national-teams",
      "EC",
    ],
    // Kotimaa is a separate registry; honouring its column here would render a
    // TASO competition under a football-data heading.
    [
      "the region default, ignoring a domestic preference",
      { defaultCompetitionDomestic: "M1L" },
      {},
      "foreign",
      "PL",
    ],
    // A shared link must render what it says (specs/012), and a stored default
    // is a weaker statement than a typed URL.
    [
      "the URL, over any preference",
      { defaultCompetitionForeign: "BL1" },
      { kilpailu: "PL" },
      "foreign",
      "PL",
    ],
    ["the region default for a signed-out reader", null, {}, "foreign", "PL"],
    // A competition can be retired long after someone chose it.
    [
      "the region default when the stored code has left the registry",
      { defaultCompetitionForeign: "GONE" },
      {},
      "foreign",
      "PL",
    ],
  ] as const)("opens %s", async (_case, stored, params, region, expected) => {
    getViewerPreferences.mockResolvedValue(stored === null ? null : preferences(stored));

    const context = await resolveBasePageContext(params, region);

    expect(context.status === "ok" && context.competitionCode).toBe(expected);
  });

  it("reads each region from its own column, never another's", async () => {
    // The mapping between `CompetitionRegion` and the stored columns is where a
    // silent bug would live: honouring the foreign column on /maajoukkueet
    // would render a Bundesliga page under a national-teams heading.
    getViewerPreferences.mockResolvedValue(
      preferences({ defaultCompetitionForeign: "BL1", defaultCompetitionNational: "EC" })
    );

    const foreign = await resolveBasePageContext({}, "foreign");
    const national = await resolveBasePageContext({}, "national-teams");

    expect(foreign.status === "ok" && foreign.competitionCode).toBe("BL1");
    expect(national.status === "ok" && national.competitionCode).toBe("EC");
  });

  it("lets a team's own context outrank the preference", async () => {
    // On a team page the team defines the context; the preference is about
    // where an unqualified page lands.
    getViewerPreferences.mockResolvedValue(preferences({ defaultCompetitionForeign: "BL1" }));

    const context = await resolveBasePageContext({}, "foreign", {
      competitionCode: "PL",
      seasonId: 2025,
    });

    expect(context.status === "ok" && context.competitionCode).toBe("PL");
  });

  it("falls back to the region default for a signed-out reader", async () => {
    const context = await resolveBasePageContext({}, "foreign");

    expect(context.status === "ok" && context.competitionCode).toBe("PL");
  });

  it("falls back when the stored competition has left the registry", async () => {
    getViewerPreferences.mockResolvedValue(preferences({ defaultCompetitionForeign: "GONE" }));

    const context = await resolveBasePageContext({}, "foreign");

    expect(context.status === "ok" && context.competitionCode).toBe("PL");
  });

  it("falls back to the preference on an invalid kilpailu, and names it in the notice", async () => {
    // The spec first said this must fall back to the *hardcoded* default,
    // reasoning that the notice would otherwise name a competition the reader
    // never asked for. That was wrong on both counts: `ContextNotices` renders
    // `resolved.competitionName`, so it names whatever is actually shown, and a
    // stored preference is something the reader explicitly chose. The spec was
    // corrected to match.
    getViewerPreferences.mockResolvedValue(preferences({ defaultCompetitionForeign: "BL1" }));

    const context = await resolveBasePageContext({ kilpailu: "NOPE" }, "foreign");

    expect(context.status === "ok" && context.competitionParam).toEqual({ kind: "invalid" });
    expect(context.status === "ok" && context.competitionCode).toBe("BL1");
    // The banner and the page therefore agree.
    expect(context.status === "ok" && context.competitionName).toBe("Bundesliga");
  });

  it("does not look preferences up when the URL already settles it", async () => {
    // A valid `?kilpailu=` cannot be overridden, so the auth and Postgres
    // lookup behind `getViewerPreferences` would be paid for nothing on every
    // signed-in request.
    await resolveBasePageContext({ kilpailu: "PL" }, "foreign");

    expect(getViewerPreferences).not.toHaveBeenCalled();
  });

  it("does not look preferences up when a team context already settles it", async () => {
    await resolveBasePageContext({}, "foreign", { competitionCode: "PL", seasonId: 2025 });

    expect(getViewerPreferences).not.toHaveBeenCalled();
  });

  it("looks them up only when nothing else has", async () => {
    await resolveBasePageContext({}, "foreign");

    expect(getViewerPreferences).toHaveBeenCalledTimes(1);
  });
});
