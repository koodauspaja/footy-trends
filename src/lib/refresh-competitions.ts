import {
  competitionsInRegion,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import {
  DOMESTIC_COMPETITIONS,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";
import { type CompetitionChoice, type CompetitionOption, encodeChoice } from "@/lib/refresh-view";

/**
 * Which competitions the forced refresh offers, and what they are called. It
 * touches no database and no provider.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * Every competition the tool offers, in the order the `<select>` renders them.
 *
 * decisions/029-forced-season-refresh.md
 */
export function listCompetitionOptions(): {
  domestic: CompetitionOption[];
  foreign: CompetitionOption[];
} {
  return {
    domestic: DOMESTIC_COMPETITIONS.map((competition) => ({
      value: encodeChoice({ source: "taso", code: competition.code }),
      label: competition.name,
      source: "taso" as const,
    })),
    foreign: competitionsInRegion("foreign").map((competition) => ({
      value: encodeChoice({ source: "football-data", code: competition.code }),
      label: competition.name,
      source: "football-data" as const,
    })),
  };
}

/**
 * Whether a choice names a competition this app has, checked against the
 * registries and not against the shape of the string.
 *
 * decisions/029-forced-season-refresh.md
 */
export function isKnownCompetition(choice: CompetitionChoice): boolean {
  if (choice.source === "taso") {
    return parseDomesticCompetitionParam(choice.code).kind === "valid";
  }
  // Scoped to `"foreign"`, which is what keeps national-team competitions out:
  // they are in the same registry, and they have no standings depending on a
  // deduction — the problem this tool solves.
  return parseCompetitionParam(choice.code, "foreign").kind === "valid";
}

export function competitionNameFor(choice: CompetitionChoice): string {
  return choice.source === "taso"
    ? getDomesticCompetitionName(choice.code)
    : getCompetitionName(choice.code);
}
