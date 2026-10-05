# 531 — Comments say what the code is for: decisions

Chore #531, decided by Miikka on 2026-10-05. Comments were 42% of `src/`, read by
nobody but the coding agent, and every line of them spends Sourcery's diff
budget. What the agent needs beside the code is short; the rest is looked up
here.

## A comment says what a thing is for

One to three lines about the thing itself, or a constraint the code cannot show.
Then the decisions behind it, as paths: the original feature's first, then the
later ones (bugs, chores, other features), oldest first.

```ts
/**
 * Turns a cup's knockout matches into ties, one row per pairing with the legs
 * aggregated.
 *
 * decisions/014-champions-league.md
 * decisions/015-finnish-cups.md
 * decisions/531-comments-say-what-code-is-for.md
 */
```

The feature that built it, a later feature that changed it, then this chore,
which moved its comments' reasons here. How code used to work, which pull
request found something and what a reviewer said are history, which lives in
`decisions/`; a comment cites no issue or pull request number. A test's name
says what it checks, and a comment stays only where the arrangement is not
obvious.

## Decision records are added, not edited

A later record says which earlier one it overrides, and the earlier one stays as
it was. A bug or a chore writes one whenever it changes something meaningful,
`decisions/NNN-short-name.md` with the issue number, as `174`, `304`, `309` and
`318` already are; one with nothing to explain writes none, and placeholder files
stay banned. This overrides "chores and bugs have neither, by design".

## Where a reason cut from a comment goes

- Citing an issue: that issue's record, created if missing. An existing record
  is not rewritten; the text is added under a dated heading naming its source.
- Citing none, or only a pull request: the batch's record, this one, a section
  per source file.
- Each entry names the path and the function or block. The commit it was cut at
  is `55a14fc` throughout, so `git show 55a14fc:<path>` gives the original.
- The comment left behind links the record; a comment inside a function is
  covered by the link on that function's doc comment.
- What is only history is not moved: the commit has it.

## The check

`tests/unit/scripts/comment-rules.test.ts`, in `npm run test:unit`, reads every
comment through the TypeScript parser, so a `//` in a string or JSX text is not
one. It fails when:

| Rule | Why |
|---|---|
| A cited `decisions/…md` does not exist | a link to nowhere is a stale comment again |
| The comment lines citing an issue or pull request number differ in count from the recorded one | above it, a new citation; below it, the record is lowered, so the count only falls |
| A doc comment starts on the line after another ends | the upper one describes something else, or the same thing twice |

Doc comments over twelve lines are reported, never failed on. A doc comment, a
blank line and another is a file header above a declaration, and passes.

## The batches

At most 150 000 diff characters each, measured before the pull request opens:
Sourcery's seven-day budget is shared, and about 1 570 000 had been spent in the
window when this one was sized. The first batch is the files the original list
in #531 named. Two of them, `taso.ts` and `taso-standings-service.ts`, hold
62 000 characters of comments between them and would have taken the batch to
175 000, so here they get only the listed defects and, in the second, the
stacked doc comments. Their full trim is the next batch.

Nine files outside the batch had eleven stacked doc comments: `backfill-run.ts`,
`migration-name.ts`, `next-version.ts` and `services-plan.ts` in `scripts/`, and
five test files. Each comment moved, unchanged, onto what it describes, or a
blank line now marks it as the file header it is.

## Reasons moved from comments, 2026-10-05

### `src/components/taso-standings-controls.tsx`

- **`TasoStandingsControls`.** Said only one Finnish competition existed, untrue
  since `specs/013`. There is no `Kilpailu` select because the competition is
  chosen on `/kotimaa` and `SeasonForm` carries it hidden, as for
  `MatchesControls` and `TeamSeasonSelector`.
- **The round select.** A cup's groups are all knockout rounds, so it would offer
  only "Koko kausi"; `MatchesControls` guards the same way.

### `src/lib/admin-users.ts`

- **Module.** Apart from `admin-actions.ts` so the rules are tested without a
  `"use server"` boundary. The acting admin's id is a parameter, so a caller that
  skipped the gate cannot spoof it.
- **`listUsers`.** Newest first, as the list's usual question is "who is new".
  It replaced a hard cap of 500 that made the oldest accounts unreachable.
- **`withAdminsLocked`.** Locking the admin set, not the target row, makes the
  second of two demotions wait and re-count. A row becoming admin meanwhile only
  raises the count, which refuses less often, never more dangerously.
- **`guardedWrite`.** Both writes had it verbatim (Sonar: 18.1% duplicated
  lines), and a guard written twice eventually differs.
- **`changeRole`.** An admin who wants to leave is removed by another.
- **`deleteUser`.** Avatar bytes live in Postgres, so the cascade covers them;
  sign-out through the cascade, not a separate revocation, is relied on.

### `src/lib/cup-bracket.ts`

- **`BracketSourceMatch.declaredWinner`.** A level Finnish cup tie is settled on
  penalties TASO never itemises, so the score alone would read as a draw.
- **`BracketLeg.homeGoals`, `legScore`.** Liverpool "1-5" Paris Saint-Germain
  (LAST_16, 2024/25) was 0-1, penalties 1-4; `fullTime` beside a 1-1 (rp)
  aggregate contradicts the tie.
- **`TieDecision`.** "(rp)" on `declared` would assert a shootout the data does
  not record; the winner is in bold instead.
- **`pairLegs`.** Carried a stale copy of `buildRound`'s doc comment; deleted.
- **`orderRoundsForTree`.** In kickoff order a team can win the top
  quarter-final and appear in the bottom semi-final, as the real MSC 2025 bracket
  does. It works back from the last round, and is presentation only, so
  `buildBracket` stays chronological for the round lists.

### `src/lib/force-refresh.ts`

- **Module.** The two steps are all that stands between a truncated provider
  answer and a deleted season: nothing in a partial answer tells it from a
  season that lost fixtures, so a person looks at the removals.
- **`listSeasonsFor`.** New seasons come through the ordinary sync. Per
  competition, as resolving ten at once would turn a cold Redis into ten
  requests against a rate-limited plan. `resolveTasoSeasonContext` would have
  written rows on a mere preview (found in review).
- **`storedSeasonsFor`.** A second copy of "what do we hold" is how the ceiling
  and the season list once disagreed.
- **`cacheKeysFor`.** `taso:season-context`, `taso:categories` and
  `football-data:competition` stay. A key spelled out twice changes in one place,
  and the refetch then silently answers from the cache it meant to bypass.
- **`dedupedGroupTeams`.** Carried a doc comment left from the per-source diff
  functions `compare` replaced; deleted.
- **`compare`.** Run twice so a stale bounce shows the rows there now. It was
  two functions, and each seam cost a review round. An `&&` across the tables
  would let matches-without-standings destroy a finished season's standings.
- **`snapshotHashOf`.** Hashing the provider alone would accept an approval
  built on rows that are gone, removing matches the admin never saw.
- **`computeDiff`.** The writer is shared with the ordinary sync, where deleting
  a dropped team is right. Within the fifteen-minute window the apply reads the
  same bytes; past it, a changed answer becomes a refusal. A server action's
  throw reaches the client as a generic error, hence `"read"`.
- **`writeSnapshot`.** `synchronizeGroupTeams` deleting first is right here: it
  runs only on a non-empty, approved answer. Removal by id, never a predicate
  over the season, which would widen with the next row. Without `tx` a group
  replacement could commit and a later delete fail (found in review).
  Serializable as in `scripts/grant-admin-run.ts`: a few runs a year cost
  nothing against overwriting someone's correction.

### `src/lib/favourites.ts`

- **Module.** One table with a `kind` would need four nullable columns and a rule
  about which pair is legal.
- **`withUserLocked`.** The unique index does not object to two different
  favourites, and under Read Committed each statement takes its own snapshot.
- **`toggleFavouriteTeam`.** A toggle, so the client never picks add or remove
  from state it may have wrong. The button is disabled in flight, so a double
  flip needs two tabs.
- **`favouritesForSession`.** It runs in better-auth's `customSession` on every
  `/api/auth/get-session`: missing stars cost less than a missing header.
- **`TASO_NATIONAL_BUCKET_PREFIX`.** A list of ids would silently send next
  season's teams to the wrong place.
- **`idRouteFor`.** Carried `nationalTeamPathFor`'s doc comment; each now has
  its own.
- **`regionFor`.** For TASO, `/maajoukkueet/joukkue/[id]` is football-data's page
  and `/kotimaa/joukkue/[id]` is scoped to the domestic bucket, so neither finds
  a national-team id.
- **`FavouriteTeamView`.** The competition and season serve `specs/027`, where
  `FC Honka` is nine teams.
- **`resolveTeamNames`.** Not stored on the row, or a renamed club keeps its old
  name until re-favourited (pull request #254 rests on telling it from one that
  does not exist). Unscoped by region, as `specs/022` has a team span
  competitions: fifty ids in one `IN` beat fifty guesses. `distinct on`, as
  unordered rows show whichever name the planner returned last. Its two stacked
  doc comments are merged.

### `src/lib/standings-service.ts`

- **`getSyncedSeasonMatches`.** `refreshFailed` tells "stale but present" from
  "nothing to show".
- **`getTeamPositionSeries`.** Not `getStandings({ round })`, which re-reads the
  season per call.
- **`getTeamPanelMatches`.** Every finished match counts, as in the table's
  `Vire`; the team id is for the log line.
- **`getTeamSeasonComparison`.** Said "league seasons only", untrue since
  `specs/040`. A past season makes no provider request: `needsRefresh` is
  `false` for any stored season but the active one.
- **`seasonsBeside`, `isLeagueCompetition`.** The latter's doc comment sat on the
  former. An unknown code would add its matches to every pooled rate and name
  itself `PL` in the Finnish `Verrattuna` line.
- **`readSeasonFor`.** Erroring on stale rows here alone would make this panel
  disagree with the eight beside it, from the same read.
- **`getCupSeason`.** The tables, stage list and bracket ask about one season,
  which the provider returns in one response.

### `src/lib/taso.ts`

- **`getCurrentSeason`, `TasoGroupTeam`.** Named `resolveCurrentTasoSeason` and
  `isPlayoffGroup`, both deleted; the second is `keepsATable` now.

### `src/lib/taso-standings-service.ts`

- **`CURRENT_SEASON_CACHE_TTL_SECONDS`.** Named the deleted
  `getCachedSeasonGroups`, and said `taso.ts` does no caching, which it now does.
- **Two doc comments above `TasoTeamStanding`,** attached to nothing. `specs/009`
  chose own-calculated groups by shape, the lowest `group_id` being the origin;
  `specs/013` found Kakkonen's three parallel origins, P21 Ykkönen 2026 without a
  group 1, and P20 Ykkönen 2024's ids 1, 2, 10, 11, 12. So every group with a
  table is calculated and checked against TASO's points (`reproducesTasoPoints`).
  Deleted.
- **`resolveTasoSeasonContext`.** Its doc comment sat on
  `resolveTasoSeasonCeiling`. It replaced `specs/009`'s `LATEST_TASO_SEASON`;
  the ceiling falls back from discovery to the newest stored season to the floor.
  Answering "does it have matches" syncs the season, bounded by `cache()` and the
  15-minute Redis TTL.
- **`UNRANKED`.** Carried `publishedPosition`'s doc comment; each now has its own.
- **`classifySeasonGroups`.** Two doc comments, merged. `phase_number` is
  unreliable for ordering, hence `group_id`.
- **`getTeamSeasonComparison`.** Said "league seasons only" and named
  `otherLeagueSeasons` as the rule's home, neither true since `specs/040`.
- **`seasonsBeside`, `isDomesticLeague`.** The latter's doc comment sat on the
  former.
- **`teamLeagueMatches`.** Its doc comment sat on `teamCupMatches`. Results are
  what TASO publishes, so an unverified table does not stop them as it stops a
  position; across a split they continue, as the table's `Vire` does.
