# 079 — Arvauspeli: members' guesses on a group's page: decisions

Feature #775, `specs/079-group-members-guesses.md`. A group's page lists its
members' guesses on the season's matches once they have kicked off, with what
each paid.

| Decision | Why |
|---|---|
| The read is part of `readGroup`, after the membership is known, so no member's account id reaches the page's data. A failure logs `Reading Arvauspeli members' guesses failed` with the user and group ids, and costs only the section (`guesses: "error"`) | S1, the spec's Security and Logging |
| Two queries choose and read the guesses: first the page's matches, those any member guessed whose stored kickoff has passed, newest kickoff first and the match id after it, `shown + 1` of them to know whether there are more; then the members' guesses on those matches. Then the ledger's payments for those guesses and `readModelGuesses` for those matches, all four in one read-only snapshot, as `readBoardEntries` reads, so a settlement committing between them cannot show a settled guess as waiting. The spec had one query; one to choose the page and one to read it keep a page to ten matches whatever the season holds | S1, the spec's Performance |
| "Kicked off" is the match's current stored kickoff having passed, as specs/073's shares have it, applied in the query, so a postponed match hides again until its new kickoff | The spec's Edge Cases and Security |
| A row is read as the player's own `Ratkaistut` reads it: `storedGuess` and `settledResult` from the store, now exported, and `paymentsOf`, the ledger's payments by guess, taken out of `playingView` for both | S2. One transformation, so a member's row and the player's own row cannot disagree |
| The lines that say a guess, a settled match, what it paid and the models' guesses move from `guessing-game-page.tsx` to `guessing-game-lines.tsx`, which the player's page and the group's page both import. `SettledLines` is the settlement line, the rarity bonus and the models' reward together | S2 |
| A match's result is the one its settled guesses were judged against (072's first settlement is final); before any is settled, the match shows no score | specs/072 S9 |
| A match's rows follow the members' order on the page, by when they joined | The same order as `Jäsenet` |
| `?ottelut=` is how many matches are listed: 10, then 20 and so on to 200, by "Näytä aiemmat ottelut", a `SameRouteLink` that keeps the scroll. Anything else is the first ten | S1. Cumulative, so the page needs no link back |
| The invite page and the privacy page say members see each other's guesses after kickoff, those made before joining included | S4 |
| Tests: unit for the paging rule, the store's read over its faked client, the section's states and the route's parameter; integration against Postgres for the kickoff rule, a postponed match, a former member's guesses gone and the payments; end to end in `guessing-game-group.spec.ts` | Spec, Tests Required |
