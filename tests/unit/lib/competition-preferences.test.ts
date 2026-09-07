import { describe, expect, it } from "vitest";
import {
  competitionOptionsFor,
  fallbackCompetitionFor,
  fallbackLabelFor,
  preferredCompetitionFor,
} from "@/lib/competition-preferences";
import { NO_PREFERENCES, type Preferences } from "@/lib/regions";

function withPreferences(overrides: Partial<Preferences>): Preferences {
  return { ...NO_PREFERENCES, ...overrides };
}

describe("preferredCompetitionFor", () => {
  it("returns the stored code for each region from its own column", () => {
    const preferences = withPreferences({
      defaultCompetitionDomestic: "M1L",
      defaultCompetitionForeign: "BL1",
      defaultCompetitionNational: "EC",
    });

    expect(preferredCompetitionFor("kotimaa", preferences)).toBe("M1L");
    expect(preferredCompetitionFor("ulkomaat", preferences)).toBe("BL1");
    expect(preferredCompetitionFor("maajoukkueet", preferences)).toBe("EC");
  });

  it("is null when the reader has no preferences at all", () => {
    // Null, not the default: the caller owns its own fallback.
    expect(preferredCompetitionFor("kotimaa", null)).toBeNull();
    expect(preferredCompetitionFor("kotimaa", NO_PREFERENCES)).toBeNull();
  });

  it("ignores a code that has since left the registry", () => {
    // A competition can be retired long after someone chose it. Stranding a
    // reader on a dead page is worse than ignoring their preference.
    const preferences = withPreferences({ defaultCompetitionDomestic: "GONE" });

    expect(preferredCompetitionFor("kotimaa", preferences)).toBeNull();
  });

  it("ignores a code stored against the wrong region's registry", () => {
    // `PL` is real, but it is a foreign competition. Honouring it on Kotimaa
    // would render a Premier League page under a Finnish heading.
    const preferences = withPreferences({
      defaultCompetitionDomestic: "PL",
      defaultCompetitionNational: "PL",
    });

    expect(preferredCompetitionFor("kotimaa", preferences)).toBeNull();
    expect(preferredCompetitionFor("maajoukkueet", preferences)).toBeNull();
  });
});

describe("fallbacks", () => {
  it("names each region's hardcoded default", () => {
    expect(fallbackCompetitionFor("kotimaa")).toBe("VL");
    expect(fallbackCompetitionFor("ulkomaat")).toBe("PL");
    expect(fallbackCompetitionFor("maajoukkueet")).toBe("WC");
  });

  it("labels the unset option with the competition it actually falls back to", () => {
    // Built from the same helper the resolver uses, so the label and the
    // behaviour cannot drift apart.
    expect(fallbackLabelFor("kotimaa")).toBe("Oletus (Veikkausliiga)");
    expect(fallbackLabelFor("ulkomaat")).toBe("Oletus (Valioliiga)");
    expect(fallbackLabelFor("maajoukkueet")).toBe("Oletus (MM-kisat)");
  });
});

describe("competitionOptionsFor", () => {
  it("offers each region its own registry, and never another's", () => {
    const domestic = competitionOptionsFor("kotimaa").map((option) => option.code);
    const foreign = competitionOptionsFor("ulkomaat").map((option) => option.code);
    const national = competitionOptionsFor("maajoukkueet").map((option) => option.code);

    expect(domestic).toContain("VL");
    expect(domestic).not.toContain("PL");
    expect(foreign).toContain("PL");
    expect(foreign).not.toContain("WC");
    expect(national).toContain("WC");
    expect(national).not.toContain("PL");
  });

  it("offers every region something to choose", () => {
    for (const region of ["kotimaa", "ulkomaat", "maajoukkueet"] as const) {
      expect(competitionOptionsFor(region).length).toBeGreaterThan(0);
    }
  });
});
