/**
 * What a period is on the page the `Analyysit` section sits on, and so every
 * Finnish string that names one: a season on a club page, a calendar year on a
 * national-team page. One value per page.
 *
 * decisions/041-national-team-analytics.md
 */

export type AnalyticsAxis = {
  /** The comparison panel's own heading. */
  comparisonHeading: string;
  /** The filled column, in the chart's legend and in its text alternative. */
  selectedLabel: string;
  /** `Verrattuna 11 muuhun kauteen: Veikkausliiga, Ykkönen`. */
  baselineLine: (periods: number, names: readonly string[]) => string;
  /** Shown instead, when there is no other period to compare against. */
  noOthersMessage: string;
  /** When a record was set: one period, or the two it ran between. */
  recordSpan: (from: string, to: string) => string;
  /** The group holding the panels that summarise the whole period. */
  wholeHeading: string;
  /** The group holding the panels that look outside it. */
  otherHeading: string;
};

/**
 * A club page: the period is a season.
 *
 * decisions/041-national-team-analytics.md
 * decisions/038-season-against-history.md
 * decisions/039-streak-records.md
 */
export const SEASON_AXIS: AnalyticsAxis = {
  comparisonHeading: "Tämä kausi verrattuna",
  selectedLabel: "Tämä kausi",
  baselineLine: (periods, names) => `Verrattuna ${periods} muuhun kauteen: ${names.join(", ")}`,
  // Miikka's wording: the club has no other stored season to compare with.
  noOthersMessage: "Joukkueelle ei löydy otteluita muilta kausilta.",
  recordSpan: (from, to) => (from === to ? `Kausi ${from}` : `Kaudet ${from}–${to}`),
  wholeHeading: "Kausi kokonaisuutena",
  otherHeading: "Muut kaudet",
};

/**
 * A national-team page: the period is a calendar year, and the middle group
 * covers every match since 2018 rather than one of them — so it is named for
 * what it covers instead of for a period it does not have.
 *
 * decisions/041-national-team-analytics.md
 */
export const HISTORY_AXIS: AnalyticsAxis = {
  comparisonHeading: "Tämä vuosi verrattuna",
  selectedLabel: "Tämä vuosi",
  baselineLine: (periods, names) => `Verrattuna ${periods} muuhun vuoteen: ${names.join(", ")}`,
  noOthersMessage: "Joukkueelle ei löydy otteluita muilta vuosilta.",
  recordSpan: (from, to) => (from === to ? `Vuosi ${from}` : `Vuodet ${from}–${to}`),
  wholeHeading: "Koko historia",
  otherHeading: "Muut vuodet",
};
