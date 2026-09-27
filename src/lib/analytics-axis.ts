/**
 * What a period *is* on the page the `Analyysit` section sits on — and so every
 * Finnish string that names one (specs/041, S11 and S13).
 *
 * A club page's period is a season. A national-team page's is a calendar year:
 * it has no season at all, so its charts run across the whole history and only
 * `Muut vuodet` reads years as periods (specs/041, S3 and S4).
 *
 * **One value per page, not one flag per string.** The panels used to spell
 * `kausi` into their own headings, which is why this exists: a page that says
 * `Tämä vuosi verrattuna` under a group called `Muut kaudet` is worse than one
 * that says neither. Picking the axis picks every word at once, so a page cannot
 * disagree with itself — and the two constants below are the only two axes the
 * app has.
 */

export type AnalyticsAxis = {
  /** The comparison panel's own heading. */
  comparisonHeading: string;
  /** The filled column, in the chart's legend and in its text alternative. */
  selectedLabel: string;
  /** `Verrattuna 11 muuhun kauteen: Veikkausliiga, Ykkönen` (specs/038). */
  baselineLine: (periods: number, names: readonly string[]) => string;
  /** Shown instead, when there is no other period to compare against. */
  noOthersMessage: string;
  /** When a record was set: one period, or the two it ran between (specs/039, S8). */
  recordSpan: (from: string, to: string) => string;
  /** The group holding the panels that summarise the whole period (#424). */
  wholeHeading: string;
  /** The group holding the panels that look outside it. */
  otherHeading: string;
};

/** A club page: the period is a season, as specs/038 and specs/039 wrote it. */
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
 * what it covers instead of for a period it does not have (specs/041, S13).
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
