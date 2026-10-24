import Link from "next/link";
import { formatDecimal, percentText } from "@/components/charts/line-chart";
import { inProgressSeasonLine } from "@/components/competition-analytics";
import { eloGaveText } from "@/components/season-surprises";
import { teamDisplayName } from "@/lib/match-detail";
import {
  type CleanSheetFact,
  POINTS_DECIMALS,
  type PositionFact,
  type RunFact,
  type SeasonSummarySeries,
  type SideFact,
  type SummaryFact,
  type UpsetFact,
} from "@/lib/season-summary";
import type { StreakKind } from "@/lib/streaks";

/**
 * The block's strings. The heading is its group's: the block has no second one.
 *
 * decisions/066-season-summary.md
 */
export const SUMMARY_HEADING = "Kausi lyhyesti";
export const SUMMARY_ERROR_MESSAGE =
  "Kauden yhteenvetoa ei voitu laskea. Yritä myöhemmin uudelleen.";

const EVERY_SEASON = "tallennetuilla kausilla";

const RUN_NAMES: Record<StreakKind, string> = {
  wins: "voittoputki",
  unbeaten: "tappioton putki",
  defeats: "tappioputki",
  winless: "voitoton putki",
};

/**
 * `Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.`: the count is the
 * selected season and the earlier ones it beats in a row.
 *
 * decisions/066-season-summary.md
 */
export function sideSentence(fact: SideFact): string {
  const side = fact.kind === "home" ? "kotisaldo" : "vierassaldo";
  return `${recordOver(fact, side)}: ${formatDecimal(fact.pointsPerMatch, POINTS_DECIMALS)} pistettä ottelua kohden.`;
}

/**
 * `Paras nollapeliosuus 5 kauteen: 42 % otteluista.`: the season's share over
 * all its matches, as `Nollapelit` prints it, with the same count of seasons a
 * home or away record gives.
 *
 * decisions/069-season-summary-clean-sheets.md
 */
export function cleanSheetFactSentence(fact: CleanSheetFact): string {
  return `${recordOver(fact, "nollapeliosuus")}: ${percentText(fact.share)} otteluista.`;
}

/**
 * `Paras sijoitus 5 kauteen: 3.`: the place `Tämä kausi verrattuna` prints for
 * the season, with its ordinal full stop.
 *
 * decisions/070-season-summary-position.md
 */
export function positionSentence(fact: PositionFact): string {
  return `${recordOver(fact, "sijoitus")}: ${fact.place}.`;
}

/**
 * `Paras kotisaldo 5 kauteen`: the record's direction, what it measures, and the
 * selected season with the earlier ones it beats in a row.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */
function recordOver(fact: SideFact | CleanSheetFact | PositionFact, measure: string): string {
  const record = fact.direction === "best" ? "Paras" : "Heikoin";
  const over = fact.everySeason ? EVERY_SEASON : `${fact.beaten + 1} kauteen`;
  return `${record} ${measure} ${over}`;
}

/**
 * `Seuran pisin voittoputki tallennetuilla kausilla: 9 ottelua.`
 *
 * decisions/066-season-summary.md
 */
export function runSentence(fact: RunFact): string {
  const matches = fact.length === 1 ? "ottelu" : "ottelua";
  return `Seuran pisin ${RUN_NAMES[fact.run]} ${EVERY_SEASON}: ${fact.length} ${matches}.`;
}

/**
 * The upset's sentence around its match label, which the block links:
 * `Kauden suurin yllätys: voitto ottelussa KuPS – AC Oulu, jolle Elo antoi 16 %.`
 *
 * decisions/066-season-summary.md
 */
export function upsetSentence(fact: UpsetFact): { before: string; match: string; after: string } {
  const { match } = fact;
  const home = teamDisplayName(match.homeTeamProviderId, match.homeTeamName);
  const away = teamDisplayName(match.awayTeamProviderId, match.awayTeamName);
  return {
    before: "Kauden suurin yllätys: voitto ottelussa ",
    match: `${home} – ${away}`,
    after: `, jolle ${eloGaveText(match.probability)}.`,
  };
}

/**
 * What the block is given: the summary, and where a match's page is. Finland's
 * national-team pages, which never have a block, give no link.
 *
 * decisions/066-season-summary.md
 */
export type SeasonSummaryPanelData =
  | { series: SeasonSummarySeries; matchHref: (providerMatchId: number) => string }
  | { series: { status: "unavailable" } };

/**
 * The block first in `Analyysit`: one to three sentences, a paragraph each,
 * under `Kausi 2026 (kesken)` while the season is played. `null` means no block.
 *
 * decisions/066-season-summary.md
 */
export function seasonSummaryPanel(data: SeasonSummaryPanelData) {
  if (!("matchHref" in data) || data.series.status === "unavailable") return null;
  if (data.series.status === "error") return <p className="mt-2">{SUMMARY_ERROR_MESSAGE}</p>;

  const { facts, inProgress, seasonLabel } = data.series;
  return (
    <div className="mt-2 space-y-1">
      {inProgress ? (
        <p className="text-muted text-sm">{inProgressSeasonLine(seasonLabel)}</p>
      ) : null}
      {facts.map((fact) => (
        <p key={factKey(fact)}>
          <Sentence fact={fact} matchHref={data.matchHref} />
        </p>
      ))}
    </div>
  );
}

function Sentence({
  fact,
  matchHref,
}: Readonly<{ fact: SummaryFact; matchHref: (providerMatchId: number) => string }>) {
  if (fact.kind === "run") return runSentence(fact);
  if (fact.kind === "cleanSheets") return cleanSheetFactSentence(fact);
  if (fact.kind === "position") return positionSentence(fact);
  if (fact.kind !== "upset") return sideSentence(fact);

  const { before, match, after } = upsetSentence(fact);
  return (
    <>
      {before}
      <Link href={matchHref(fact.match.providerMatchId)}>{match}</Link>
      {after}
    </>
  );
}

/**
 * One fact per kind, and a run per direction, so a run is told apart by its own.
 *
 * decisions/066-season-summary.md
 */
function factKey(fact: SummaryFact): string {
  return fact.kind === "run" ? `run-${fact.run}` : fact.kind;
}
