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
 * `domestic-competitions.ts` transitively reaches ioredis, so a client
 * component importing any of this fails the build on `dns`, `net` and `tls`.
 * The settings form receives its option lists as props from the server page
 * instead of reaching for them. See specs/024-account-settings.md.
 */

/**
 * Kotimaa is deliberately absent from the parameter type. Its competitions come
 * from TASO and live in `domestic-competitions.ts`; `CompetitionRegion` only
 * spans the two football-data regions, and pretending otherwise is what would
 * make the callers below silently check the wrong registry.
 *
 * Total rather than a `Partial<Record<…>>` lookup: every caller already returns
 * early for Kotimaa, so TypeScript narrows the argument here and there is no
 * "missing entry" case left to guard. A guard for an unreachable state is a
 * second source of truth and an untestable branch.
 */
function footballDataRegionFor(region: Exclude<RegionSegment, "kotimaa">): CompetitionRegion {
  return region === "ulkomaat" ? "foreign" : "national-teams";
}

/**
 * Whether a stored code still names a competition in its own registry.
 *
 * Reuses the two `parse…Param` validators rather than re-deriving membership: a
 * stored preference and a `?kilpailu=` value have to agree about what exists,
 * and two implementations of "is this a real competition" would eventually
 * disagree.
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
 * The competition a region should open, given what the reader chose.
 *
 * Null when there is no usable preference, so each caller keeps its own
 * hardcoded fallback instead of this module having to know what that is. A code
 * that has since left the registry is null too: a competition can be retired
 * long after someone chose it, and stranding a reader on a dead page is worse
 * than ignoring their preference.
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

/** The code a region falls back to when the reader has expressed no preference. */
export function fallbackCompetitionFor(region: RegionSegment): string {
  if (region === "kotimaa") return DEFAULT_DOMESTIC_COMPETITION_CODE;
  if (region === "ulkomaat") return DEFAULT_COMPETITION_CODE;
  return "WC";
}

/** A competition's Finnish name, from whichever registry owns that region. */
export function competitionNameFor(region: RegionSegment, code: string): string {
  return region === "kotimaa" ? getDomesticCompetitionName(code) : getCompetitionName(code);
}

/**
 * What the settings page shows as a region's "no preference" option, e.g.
 * `Oletus (Veikkausliiga)`. Built from the same fallback the resolver uses, so
 * the label and the behaviour cannot drift apart.
 */
export function fallbackLabelFor(region: RegionSegment): string {
  return `Oletus (${competitionNameFor(region, fallbackCompetitionFor(region))})`;
}

export type CompetitionOption = { code: string; name: string };

/**
 * A region's selectable competitions, built on the server and handed to the
 * settings form as a prop.
 */
export function competitionOptionsFor(region: RegionSegment): CompetitionOption[] {
  if (region === "kotimaa") return DOMESTIC_COMPETITIONS.map(({ code, name }) => ({ code, name }));

  return competitionsInRegion(footballDataRegionFor(region)).map(({ code, name }) => ({
    code,
    name,
  }));
}
