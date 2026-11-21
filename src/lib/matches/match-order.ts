/**
 * Chronological, the match id breaking a tie, so matches that kick off together
 * keep one order however the rows were read.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 * decisions/832-cup-forecast-tie-order.md
 */
export function byKickoffThenId<T extends { kickoffAt: Date; providerMatchId: number }>(
  left: T,
  right: T
): number {
  const byKickoff = left.kickoffAt.getTime() - right.kickoffAt.getTime();
  return byKickoff === 0 ? left.providerMatchId - right.providerMatchId : byKickoff;
}

/**
 * The order a team's own match list reads in: the matches still to play first,
 * nearest first, then the played ones newest first, so the season's first match
 * is last.
 *
 * decisions/714-page-section-order.md
 */
export function upcomingFirst<
  M extends { kickoffAt: Date; homeGoals: number | null; awayGoals: number | null },
>(matches: readonly M[]): M[] {
  const isPlayed = (match: M) => match.homeGoals !== null && match.awayGoals !== null;
  const upcoming = matches
    .filter((match) => !isPlayed(match))
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());
  const played = matches
    .filter(isPlayed)
    .sort((left, right) => right.kickoffAt.getTime() - left.kickoffAt.getTime());
  return [...upcoming, ...played];
}
