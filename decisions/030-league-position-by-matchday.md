# 030 — League position by matchday: decisions

Implementation notes for `specs/030-league-position-by-matchday.md` (#331). The
spec says what the chart does; this says how, and where the implementation had
to decide something the spec did not.

## The one property everything serves

**A plotted position always equals the position the standings page shows for
that round.** Every decision below follows from it. The chart decides no
ranking of its own: each table comes from the function the standings page's
round selector uses — `calculateStandings` with `getStandings({ round })`'s
arguments for football-data, `ownCalculatedStandings` for TASO — and the tests
check the property against those real functions, not against a restatement of
them.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the season comes from | The read the team page already makes | #331's constraint: ranking per round must not become a fetch per round. `getStandings({ round })` re-reads the season on every call, so calling it per matchday was ruled out. The chart reuses the season `getTeamMatches` loads — the whole season, every team, before it filters to one. |
| How that read is shared | React's `cache()` on football-data's `getSyncedSeasonMatches` | The spec proposed extending `getTeamMatches` to return the season. Wrapping the read in `cache()` gives the same result — one read per request, serving the match list and the chart — with one line, and it is how the TASO service's own read was already shared. The spec was updated to say so. |
| TASO's group rows | Read through `classifySeasonGroups`, which now returns them | Found during implementation and agreed in chat (*"yes, 1"*): a TASO group's table depends on stored group rows — points adjustments, and whether a split group is verified — which the TASO team page never read. The classification already read them, so it returns them rather than the chart reading them again. `getSeasonStandings` had the same double read, relying on `cache()` to fold it; it now uses the returned rows too. |
| How many TASO requests that costs | At most one per active competition per 15 minutes | Only the active season refreshes, and TASO's response is cached in Redis under a key the standings page shares. Asked about explicitly (*"it does not mean huge amount of taso requests?"*) and verified in the code before answering. |
| Caching the series | None | Measured: 38 tables over the largest league (20 teams, 380 matches) take 1.26 ms with the real `calculateStandings` — less than a Redis round-trip. A cache would only add a way for the chart to disagree with the match list beside it. The trigger to revisit is measured CPU or response time, not user count. |
| Which number is plotted | The table row's own `position`, not its index | So the chart shows exactly what the standings page displays, whatever rule produced it. |
| A team missing from a table | Throw, and let the service report an error | Unreachable: `calculateStandings` adds every match's participants to the roster, so a team that played is in every table. A branch returning `null` in each caller would be a condition no test could take. A missing team must still never become a plausible position, so the throw is caught and shown as the error message. |
| Ranking the split groups | By where their teams finished the regular season | Agreed rule B. Neither the group id nor the name records which group is upper; a fixture puts the lower teams in the lower-numbered group to prove the id is not used. Group sizes come from the data. |
| When the line stops at the split | Wherever the standings page has no per-round table | Agreed rule C, applied to the cases the code meets: a continuation that is not verified (pass-through), one with no carry-over configured, and — found while covering a branch — a continuation played only in matches TASO gave no round. The last one had first stopped silently; it now shows the note like the others. |
| Leagues played in parallel pools | One league per pool, until the end of its continuation | Agreed rule E, found in review. The first version stopped the line for any season with more than one regular-season group, written with BTSM 2015 in mind. Checking Sourcery's axis finding showed the same rule caught **Kakkonen** 2019, 2022 and 2024–2026, whose pools each continue into verified groups of their own, so the note claimed the standings page could not show positions that it does show. Kakkonen's 2024 and 2025 regulations rank a pool's top two over all 23 rounds together, the combined table the chart plots. The rule is removed; the offset counts only the team's own pool's continuations, and the axis spans the pool. The promotion playoff after it is a bracket — *"no line there"*. |
| A league season with no per-round table at all | No section (`unavailable`) | Not in the spec's list, derived from rule C: a regular season shown with TASO's own numbers has no round selector, so there is nothing the chart could equal. Showing "no rounds played" would be false. **Raised for confirmation in the pull request.** |
| The gate's position | Before the series is computed | A signed-out request never calls `loadSeries`, so its page carries no position at all — not hidden, absent. Tested in the unit suite and in the HTML the e2e server returns. |
| The e2e override | A server flag, a `_test` database, and a request header — all three | The e2e suite cannot sign in on the server (`tests/e2e/session.ts` reaches only the browser). Miikka agreed to an override. Its safeguard is that both server-side conditions are ones production cannot meet, and a test that sends no header is signed out, which is how the prompt is tested end to end on the same server. |
| The chart foundation | Hand-rolled SVG | Agreed Q7. It renders on the server with no client JavaScript, and the tests assert what is drawn — which way the axis runs, where each point lands, that one round does not divide by zero. The geometry (`scale`, `ticksFor`) is exported and tested directly. Colours are the theme's tokens, so dark mode is the same drawing; checked by screenshot in both themes. |

## What the tests prove, and how

- **Equality with the standings page**, three ways: football-data against the
  real `getStandings({ round })` for every round; TASO against the real
  `getSeasonStandings` for every team and every round, offset included; and end
  to end, Arsenal's position after round 10 of 2024/25 against the standings
  page's own `?kierros=10` row.
- **The request budget**: a ten-round season still makes one database read for
  football-data and two for TASO, and asks no provider anything.
- **Parallel pools**, with a Kakkonen-shaped fixture: two pools, each with an
  upper and a lower continuation. The axis is the pool's four, not the
  competition's eight, and a lower-group leader sits below its own pool's upper
  group only. One mutation there survives, and is equivalent: counting every
  pool's continuations as candidates changes nothing, because
  `teamsInGroupsAbove` ranks a group with none of the pool's teams last. The
  filter stays because it says what is meant.
- **TASO fixtures derive their published points from `calculateStandings`**
  rather than typing them. A hand calculation got a four-team table wrong while
  this was being written; the fixture that encodes a guess about the other system
  was the thing worth not guessing.

## Left open, deliberately

- **The text alternative is for screen readers.** The spec asks for the values
  as text "for screen readers and for readers who cannot read the chart". The
  list is `sr-only`; making it visible needs a toggle, and a toggle needs a
  Finnish label the spec does not have. Raised in the pull request rather than
  invented here.
- **A signed-out reader on a page with no per-round table** sees the prompt,
  and after signing in sees no section. The gate runs before the series is
  computed, so the page cannot know. Rare — it needs an unverified regular
  season — and noted rather than worked around.
