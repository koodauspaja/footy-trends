/**
 * How `Arvauspeli` says a guess, a settled match and what a guess paid, and
 * the models' line: the same words on the player's own rows and on a group's
 * page.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 * decisions/079-group-members-guesses.md
 */

import { modelLabel } from "@/components/prediction-quality-page";
import type { Guess, Settlement } from "@/lib/guessing-game";
import type { ModelGuess } from "@/lib/guessing-game-models";
import type { Paid } from "@/lib/guessing-game-store";

export function formatGuess(guess: Guess): string {
  return guess.kind === "outcome" ? guess.outcome : `${guess.homeGoals}–${guess.awayGoals}`;
}

/**
 * What each way of settling says before what it paid back. A miss says only
 * that it missed.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
const SETTLEMENT_LABELS: Readonly<Record<Exclude<Settlement, "miss">, string>> = {
  exact: "Oikea tulos",
  difference: "Oikea maaliero",
  outcome: "Oikea merkki",
  awarded: "Ottelu ratkaistiin päätöksellä",
  abandoned: "Ottelu keskeytettiin, pelimerkit palautettu",
  undecided: "Ottelua ei ratkaistu, pelimerkit palautettu",
  void: "Arvaus tehtiin ottelun alettua, pelimerkit palautettu",
};

export function settledLine(guess: Pick<Paid, "settlement" | "reward">): string {
  return guess.settlement === "miss"
    ? "Ei osunut"
    : `${SETTLEMENT_LABELS[guess.settlement]} +${guess.reward}`;
}

export function settledMatch(match: {
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}): string {
  return match.homeGoals === null || match.awayGoals === null
    ? `${match.homeTeamName} – ${match.awayTeamName}`
    : `${match.homeTeamName} ${match.homeGoals}–${match.awayGoals} ${match.awayTeamName}`;
}

/**
 * A settled guess's lines: how it was settled and what that paid, then the
 * rarity bonus and the models' reward when either was paid.
 *
 * decisions/072-match-guesses.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */
export function SettledLines({ paid }: Readonly<{ paid: Paid }>) {
  return (
    <>
      <p className="text-sm">{settledLine(paid)}</p>
      {paid.bonus > 0 && <p className="text-sm">Harvinainen osuma +{paid.bonus}</p>}
      {paid.modelsReward > 0 && <p className="text-sm">Voitit mallit +{paid.modelsReward}</p>}
    </>
  );
}

function modelGuessText(guess: ModelGuess): string {
  return guess.score === null ? guess.outcome : `${guess.score.homeGoals}–${guess.score.awayGoals}`;
}

/**
 * The models' guesses on a match once it has kicked off, by the names the
 * prediction pages give them, or nothing when no model guessed it.
 *
 * decisions/074-against-the-models.md
 */
export function ModelsLine({ models }: Readonly<{ models: readonly ModelGuess[] | undefined }>) {
  if (models === undefined || models.length === 0) return null;
  const guesses = models.map((guess) => `${modelLabel(guess.model)} ${modelGuessText(guess)}`);
  return <p className="text-muted text-sm">Mallit: {guesses.join(" · ")}</p>;
}
