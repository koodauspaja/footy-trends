import {
  type CompetitionRegion,
  competitionsInRegion,
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import {
  DEFAULT_DOMESTIC_COMPETITION_CODE,
  DOMESTIC_COMPETITIONS,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";
import type { Preferences, RegionSegment } from "@/lib/regions";

/**
 * Preference helpers that need a competition registry, and therefore may only
 * be imported on the server.
 *
 * decisions/024-account-settings.md
 */

/**
 * The football-data registry a region's competitions are in. Kotimaa is absent
 * from the parameter type: its competitions come from TASO.
 *
 * decisions/024-account-settings.md
 */
function footballDataRegionFor(region: Exclude<RegionSegment, "kotimaa">): CompetitionRegion {
  return region === "ulkomaat" ? "foreign" : "national-teams";
}

/**
 * Whether a stored code still names a competition in its own registry, by the
 * same validators a `?kilpailu=` value goes through.
 *
 * decisions/024-account-settings.md
 */
function isStillValid(code: string, region: RegionSegment): boolean {
  if (region === "kotimaa") return parseDomesticCompetitionParam(code).kind === "valid";

  return parseCompetitionParam(code, footballDataRegionFor(region)).kind === "valid";
}

function storedCodeFor(region: RegionSegment, preferences: Preferences): string | null {
  if (region === "kotimaa") return preferences.defaultCompetitionDomestic;
  if (region === "ulkomaat") return preferences.defaultCompetitionForeign;
  return preferences.defaultCompetitionNational;
}

/**
 * The competition a region should open, given what the reader chose. Null when
 * there is no usable preference, or the code has since left the registry.
 *
 * decisions/024-account-settings.md
 */
export function preferredCompetitionFor(
  region: RegionSegment,
  preferences: Preferences | null
): string | null {
  if (preferences === null) return null;

  const stored = storedCodeFor(region, preferences);
  if (stored === null || !isStillValid(stored, region)) return null;
  return stored;
}

/**
 * The code a region falls back to when the reader has expressed no preference.
 *
 * decisions/024-account-settings.md
 */
export function fallbackCompetitionFor(region: RegionSegment): string {
  if (region === "kotimaa") return DEFAULT_DOMESTIC_COMPETITION_CODE;
  if (region === "ulkomaat") return DEFAULT_COMPETITION_CODE;
  return "WC";
}

/**
 * A competition's Finnish name, from whichever registry owns that region.
 *
 * decisions/024-account-settings.md
 */
export function competitionNameFor(region: RegionSegment, code: string): string {
  return region === "kotimaa" ? getDomesticCompetitionName(code) : getCompetitionName(code);
}

/**
 * What the settings page shows as a region's "no preference" option, e.g.
 * `Oletus (Veikkausliiga)`. Built from the same fallback the resolver uses, so
 * the label and the behaviour cannot drift apart.
 *
 * decisions/024-account-settings.md
 */
export function fallbackLabelFor(region: RegionSegment): string {
  return `Oletus (${competitionNameFor(region, fallbackCompetitionFor(region))})`;
}

export type CompetitionOption = { code: string; name: string };

/**
 * A region's selectable competitions, built on the server and handed to the
 * settings form as a prop.
 *
 * decisions/024-account-settings.md
 */
export function competitionOptionsFor(region: RegionSegment): CompetitionOption[] {
  if (region === "kotimaa") return DOMESTIC_COMPETITIONS.map(({ code, name }) => ({ code, name }));

  return competitionsInRegion(footballDataRegionFor(region)).map(({ code, name }) => ({
    code,
    name,
  }));
}
