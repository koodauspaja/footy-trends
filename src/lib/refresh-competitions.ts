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
 * Which competitions the forced refresh offers, and what they are called, from
 * specs/029-forced-season-refresh.md.
 *
 * Its own module because both `force-refresh.ts` and `refresh-runs.ts` need it
 * — the engine to validate a submission, the log to name a competition in a row
 * written months ago — and having the log import the engine would be a cycle.
 * It touches no database and no provider.
 */

/** Every competition the tool offers, in the order the `<select>` renders them. */
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
 * Whether a choice names a competition this app actually has, checked against
 * the registries rather than against the shape of the string.
 *
 * `decodeChoice` in `refresh-view.ts` validates the shape and stays
 * client-safe; this is the half that needs the registries.
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
