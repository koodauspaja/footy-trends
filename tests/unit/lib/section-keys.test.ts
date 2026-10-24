import { describe, expect, it } from "vitest";
import {
  defaultSections,
  foldFor,
  isKnownSection,
  type PageSections,
  sectionOpen,
} from "@/lib/section-keys";

/**
 * Each kind of page's sections and how they start: the defaults, a stored
 * choice over them, and which keys a choice can be stored for.
 *
 * decisions/071-section-toggles.md
 */

const GROUPS = [
  "analytics-summary",
  "analytics-by-match",
  "analytics-whole-season",
  "analytics-other-seasons",
  "analytics-opponents",
] as const;

describe("the defaults, for a reader with no stored choice", () => {
  it("opens a team page's match list and closes its Analyysit and every group", () => {
    const team = defaultSections("team");

    expect(sectionOpen(team, "matches")).toBe(true);
    expect(sectionOpen(team, "analytics")).toBe(false);
    for (const group of GROUPS) expect(sectionOpen(team, group), group).toBe(false);
  });

  it("closes a national team page's Analyysit and every group", () => {
    const national = defaultSections("national-team");

    expect(sectionOpen(national, "analytics")).toBe(false);
    for (const group of GROUPS) expect(sectionOpen(national, group), group).toBe(false);
  });

  it("closes a standings page's knockout, forecast, Analyysit and every group", () => {
    const standings = defaultSections("standings");

    expect(sectionOpen(standings, "knockout")).toBe(false);
    expect(sectionOpen(standings, "cup-forecast")).toBe(false);
    expect(sectionOpen(standings, "analytics")).toBe(false);
    expect(sectionOpen(standings, "analytics-this-season")).toBe(false);
    expect(sectionOpen(standings, "analytics-season-by-season")).toBe(false);
    expect(sectionOpen(standings, "analytics-side-by-side")).toBe(false);
  });

  it("opens a first section whatever its kind's default, a section or a group", () => {
    expect(sectionOpen(defaultSections("standings"), "knockout", true)).toBe(true);
    expect(sectionOpen(defaultSections("team"), "analytics-by-match", true)).toBe(true);
  });
});

describe("a stored choice", () => {
  const stored: PageSections & { kind: "team" } = {
    kind: "team",
    signedIn: true,
    choices: { analytics: true, matches: false, "analytics-other-seasons": false },
  };

  it("wins over the default, open or closed", () => {
    expect(sectionOpen(stored, "analytics")).toBe(true);
    expect(sectionOpen(stored, "matches")).toBe(false);
    expect(sectionOpen(stored, "analytics-other-seasons")).toBe(false);
  });

  it("wins over a first section's opening too", () => {
    const closed: PageSections & { kind: "standings" } = {
      kind: "standings",
      signedIn: true,
      choices: { knockout: false },
    };

    expect(sectionOpen(closed, "knockout", true)).toBe(false);
  });
});

describe("foldFor", () => {
  it("saves a signed-in reader's toggle under its kind and section", () => {
    expect(foldFor({ kind: "team", signedIn: true, choices: {} }, "analytics")).toEqual({
      initiallyOpen: false,
      remember: { kind: "team", section: "analytics" },
    });
  });

  it("saves nothing for a signed-out reader", () => {
    expect(foldFor(defaultSections("team"), "matches")).toEqual({
      initiallyOpen: true,
      remember: null,
    });
  });
});

describe("isKnownSection", () => {
  it("knows each kind's own sections", () => {
    expect(isKnownSection("team", "matches")).toBe(true);
    expect(isKnownSection("national-team", "analytics-other-seasons")).toBe(true);
    expect(isKnownSection("standings", "analytics-side-by-side")).toBe(true);
  });

  it("refuses a section of another kind, an unknown kind or section, and a non-string", () => {
    expect(isKnownSection("standings", "matches")).toBe(false);
    expect(isKnownSection("national-team", "knockout")).toBe(false);
    expect(isKnownSection("match", "analytics")).toBe(false);
    expect(isKnownSection("team", "Ottelut")).toBe(false);
    expect(isKnownSection(1, "matches")).toBe(false);
    expect(isKnownSection("team", null)).toBe(false);
  });

  it("refuses an object's own built-in names, which are no section", () => {
    expect(isKnownSection("toString", "valueOf")).toBe(false);
    expect(isKnownSection("team", "constructor")).toBe(false);
    expect(isKnownSection("__proto__", "analytics")).toBe(false);
  });
});
