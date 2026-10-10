import { percentText } from "@/components/charts/line-chart";
import { canSeeAnalytics } from "@/lib/analytics-access";
import type { StoredMatch } from "@/lib/match-service";
import { getMatchSurprise } from "@/lib/surprise-service";

/**
 * `Elo antoi tälle tulokselle 8 %.`: the line under a finished match's score.
 *
 * decisions/057-surprise-index.md
 */
export function matchSurpriseSentence(probability: number): string {
  return `Elo antoi tälle tulokselle ${percentText(probability * 100)}.`;
}

/**
 * How likely Elo thought a finished match's result, or nothing: signed out,
 * not finished, drawn, or without an Elo prediction. Gated before anything is
 * read; awaited by the page, not rendered.
 *
 * decisions/057-surprise-index.md
 */
export async function MatchSurprise({ stored }: Readonly<{ stored: StoredMatch }>) {
  if (!(await canSeeAnalytics())) return null;

  const probability = await getMatchSurprise(stored);
  return probability === null ? null : (
    <p className="mb-3 text-sm">{matchSurpriseSentence(probability)}</p>
  );
}
