# 009 — Veikkausliiga standings (TASO): implementation decisions

Spec: `specs/009-veikkausliiga.md`
Issue: #88

This is part 1 of 2. The feature is split into a data-layer PR (this one:
`src/lib/taso.ts`, `src/lib/taso-standings-service.ts`, the `taso_matches`
table, and their unit/integration tests) and a UI-layer PR (the three
`kotimaa` pages, rewrites, controls) that follows in a second, stacked PR
against this branch — same split pattern as `decisions/006-other-competitions.md`,
anticipating the same Sourcery diff-size limit given this feature's size.

## The TASO wire format was live-verified in this session, correcting several assumptions in the spec

The spec's field names (`match_id`, `group_id`, `round_id`, `status`,
`points`, `starting_points`, `current_standing`, `final_group_standing`,
`category_notice`, `phase_number`, `team_A`/`club_A`) were confirmed
accurate from a prior spike, but the exact request/response shape wasn't —
the spec documented the data model, not the wire format. With the scraped
key provided mid-session, `getGroups`/`getMatches` were hit live against
`spljp25`, `spljp26`, `spljp22`, `spljp21`, `spljp23`, `spljp24`, correcting:

- **Every field in `getMatches` is a JSON string**, including
  numeric-looking ones (`match_id`, `group_id`, `round_id`, `team_A_id`,
  `team_B_id`, `fs_A`, `fs_B`) — confirmed via `curl`, not assumed.
  `normalizeTasoMatch` converts each with `Number(...)`.
- **`getGroups`' per-team fields are native JSON numbers** (`points`,
  `matches_played`, etc.) **except `team_id` and `final_group_standing`**,
  which are strings — a genuine inconsistency between the two endpoints,
  not a typo in `toPassThroughStanding`.
- **The score fields are `fs_A`/`fs_B`** (the one field-name guess that
  happened to be right) — an unplayed match's score is `""`, not `null`
  and not `"0"`. `parseScore` treats both `""` and `undefined` as "no score
  yet".
- **Kickoff time is `date` + `time`** (`"HH:MM:SS"`), not `time_start` (a
  same-named-looking field that exists but is always empty in the data
  checked). Each match also carries its own `time_zone_offset`
  (`"+0300"`/`"+0200"`) that already reflects the EEST/EET DST boundary
  correctly — used directly in `parseKickoff` instead of deriving it via
  `Intl`, which is what the original draft of this file did before live
  verification was possible.
- **`getGroups`' team array is named `teams`, not `standings`** — the spec
  text used "standings" descriptively, not as the literal field name.
- **Win/draw/loss fields are `matches_won`/`matches_tied`/`matches_lost`**,
  not `wins`/`draws`/`losses`. A `goals_diff` field is also provided
  directly (used instead of computing `goals_for - goals_against`).
- **`competition_id` alone is not scoped to Veikkausliiga.** It identifies
  the whole "SPL Jalkapallo {year}" umbrella — cup, women's, youth, and
  every other category share it, and **their `group_id`s are not globally
  unique across categories** (confirmed live: category `KC`, the national
  cup, also has a `group_id: "1"`, wholly unrelated to Veikkausliiga's own
  group 1). Both `getGroups` and `getMatches` now always send
  `category_id=VL`; omitting it was verified live to return 84 groups
  across 28 categories for one `competition_id`, which would have silently
  mixed Veikkausliiga matches with cup/youth matches under colliding
  `group_id`s in `taso_matches`. This was the most consequential correction
  — not a formatting detail but a correctness bug that would have shipped
  invisibly (no error, just wrong data) without live verification.
- A third `status` value, **`"Live"`**, exists alongside `"Played"`/
  `"Fixture"` — `normalizeTasoMatch`'s existing pass-through-unknown-status
  behavior already handles it correctly (excluded from `calculateStandings`
  same as any non-`"FINISHED"` status) with no code change needed.

## Carry-over config re-verified live, not just trusted from the spec

Rather than trusting the spec's prior-session claims, `spljp21`/`23`/`24`/
`25` were re-checked live in this session:

- **Group structure** (`group_id` 1/2/3 = Runkosarja/Mestaruussarja/
  Haastajasarja-or-Karsintasarja, plus 2022–2024's `4`/`5` bonus groups)
  matches the spec's documented structure exactly in every season checked.
- **The carry-over relationship** holds via two independent signals,
  confirmed on real data: 2023's `starting_points` for Mestaruussarja teams
  exactly equals their Runkosarja `points` (e.g. HJK: `44` both places);
  2025's Mestaruussarja `points`/`matches_played` (`67`/`32` for KuPS) are
  already the carry-over-inclusive final numbers straight from TASO, and
  running this PR's actual `normalizeTasoMatch` + `calculateStandings`
  against the real fetched Runkosarja+Mestaruussarja matches reproduced
  `67`/`32` exactly — an end-to-end confirmation of the production code
  itself, not just the config's numbers. `tests/integration/taso.test.ts`'s
  carry-over validation test encodes this as a deterministic fixture.

## `needsRefresh` bug caught by the integration test, not by unit tests

The first draft's `needsRefresh` was `seasonId >= activeSeasonId` — always
`true` for the current season, regardless of how recently it had been
synced. Unit tests (which mock the DB layer) didn't catch this because they
mock `getSeasonMatches` too, masking the resulting crash-and-fallback. The
integration test (`synchronizeMatches` followed immediately by
`getSeasonStandings` against real Postgres) surfaced it: every current-season
read was re-hitting the mocked provider function and crashing on
`undefined.length` inside `synchronizeMatches`, silently caught and papered
over by the existing "refresh failed, fall back to stored" error handling.
Fixed to mirror `standings-service.ts`'s `needsRefresh` exactly — a
15-minute time threshold (`CURRENT_SEASON_CACHE_TTL_SECONDS`) on top of the
season check, with the stored-matches query now ordered by `updatedAt`
descending so `storedMatches[0]` is actually the newest row.

## Route folder structure: English `kotimaa/` subtree + rewrites, not literal Finnish folders

Confirmed in chat before implementation, correcting the spec's own Files To
Update list (which had literally named `src/app/kotimaa/sarjataulukko/`
etc.): `next.config.ts` already has a deliberate, commented convention — App
Router folders stay English, `next.config.ts` rewrites map the Finnish
public URLs. The `kotimaa` pages (added in the UI-layer PR) will follow this
exactly: `src/app/kotimaa/standings/page.tsx`, `.../matches/page.tsx`,
`.../team/[id]/page.tsx`, with three new rewrite entries — symmetric with
the existing `standings`/`matches`/`team/[id]` folders, no hyphens, and
consistent with the stated project convention instead of a one-off
exception for this feature.

## `TasoTeamStanding`, a nullable sibling of `TeamStanding`, for the pass-through path

The spec says pass-through groups reuse "the same `TeamStanding` shape" —
but `TeamStanding`'s numeric fields are non-nullable, and Eurolopputurnaus's
own stat fields are genuinely `null` (not `0`) for every team. Coercing
`null` to `0` would misrepresent "isn't a points competition" as "zero
points," and the spec's own acceptance criteria requires "–" rendering, not
a fabricated zero. `TasoTeamStanding` mirrors `TeamStanding`'s shape field-
for-field but with `number | null` throughout (except `position`, `teamName`,
`teamProviderId`, and always-empty `form`, none of which are "stats"). The
UI-layer PR's table component will branch on `group.kind` to pick which
type it's rendering, showing "–" for a `null` field either way — the same
table markup, just typed to allow the null case pass-through groups
actually have.

## Storage: `taso_matches` schema mirrors `matches`' TS field names, not its column names

`providerMatchId`/`competitionCode` are the Drizzle *property* names (for
structural compatibility with `NormalizedTasoMatch`, letting a selected row
satisfy that type directly with no mapping step — same reason `matches`
mirrors `NormalizedProviderMatch`), but the underlying SQL columns stay
TASO-specific (`taso_match_id`, `competition_id`) rather than reusing
`matches`' column names, since they're a different id namespace entirely.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 306 unit tests passing (up from 258 pre-existing), 100% statement/branch/
  function/line coverage on the new files (`taso.ts`,
  `taso-standings-service.ts`) and on `schema.ts`.
- 21 integration tests passing against real Postgres/Redis (via
  `docker compose up -d` + `npm run db:migrate`), including the carry-over
  validation fixture test.
- Live-verified against the real TASO API (see above) with the scraped key
  — not merged into any test as a live-API dependency (all tests remain
  fixture-based/deterministic), but used during development to correct the
  wire-format assumptions before they shipped as bugs.
- UI layer (three `kotimaa` pages, round selector, group tables, error
  states) not yet built — follows in the stacked PR.

---

## Part 2: the UI layer

Everything below was implemented in the second PR, on branch
`feature/009-veikkausliiga-ui`, built on top of `main` after part 1 merged
(not stacked on the now-deleted part-1 branch, since it had already landed).

## Navigation was restructured: a region picker, decided live with the user

The spec's own "linked from `/kotimaa/`" wording turned out to be
underspecified — neither the acceptance criteria nor Files To Update said
whether `/kotimaa/` was a real page, and if so, how anyone would reach it
from the existing home page. Raised with the user mid-implementation. Their
explicit direction: a "choose your location first" landing page, not one
long list mixing domestic and international competitions. Decided and built:

- `/` is now a two-choice region picker ("Kotimaa" / "Ulkomaat"), replacing
  the old direct 9-competition list.
- The old list moved verbatim to a new `/ulkomaat` page — same content,
  same links to `/sarjataulukko?kilpailu={code}`. This does **not** violate
  the spec's explicit out-of-scope note ("don't rename `/sarjataulukko`
  etc. under `/ulkomaat/`") — that note was about the deep standings/
  matches/team routes specifically, which are untouched; only the
  *picker's own* URL moved, from `/` to `/ulkomaat`.
- A new `/kotimaa` page lists Finnish competitions (`src/lib/kotimaa-competitions.ts`
  — just Veikkausliiga today, structured the same way as `competitions.ts`
  but deliberately a separate list, per the spec's "never added to the
  `/sarjataulukko` picker's `kilpailu=` list" line). Uses the 🇫🇮 emoji
  rather than a hotlinked flag image — unlike football-data.org's
  country-flag crests, there's no existing asset source for this, and an
  emoji sidesteps the consent question the project already avoids on the
  crests-vs-flags distinction in `decisions/006-other-competitions.md`.

## Route folder structure, exactly as decided in part 1

`src/app/kotimaa/standings|matches|team/[id]/page.tsx` — English folders,
Finnish public URLs via three new `next.config.ts` rewrites
(`/kotimaa/sarjataulukko` → `/kotimaa/standings`, etc.), symmetric with the
existing `standings`/`matches`/`team/[id]` folders. `/kotimaa` and
`/ulkomaat` themselves needed no rewrite — Finnish words used directly as
both the folder name and the URL, same reasoning as the `kotimaa/`
namespace segment itself (not a translatable English word, just routing).

## One page-level round selector, not one per group

`/kotimaa/sarjataulukko` has a single `Kierros` control (via
`TasoStandingsControls`), not one per own-calculated group. Its option list
is `listSelectableTasoRounds` — the union of round numbers actually present
across every own-calculated group, which is why Mestaruussarja's own rounds
(23+) show up in the *same* dropdown as Runkosarja's (1–22): TASO's
round_id is one continuous scale for the whole season, never re-indexed per
group, so one selector reading that scale is both simpler and matches the
spec's "Kierros 23 onward, not re-indexed" line more literally than
per-group selectors would have.

## No round selector on `/kotimaa/ottelut` or `/kotimaa/joukkue/:id`

Both list a season's full match set at once (`getSeasonMatchList`/
`getTeamMatches`, no round filter) rather than paginating by round like the
football-data.org `/ottelut` does. The spec's acceptance criteria describe
both as listing "a season's matches"/"a team's matches for a season" with
no mention of rounds, unlike its `/kotimaa/sarjataulukko` criterion, which
explicitly calls out "a working round selector." Building round pagination
here would have been invented scope: TASO's continuous, group-crossing
round numbering has no natural "next round" boundary the way a single
group's 1..N numbering does, and nothing in the acceptance criteria asked
for it.

## Pass-through rows render through the same table markup as own-calculated rows

Per the spec's "same table component" instruction: one `<table>` per group
either way; `cell(value)` renders `"–"` for a `null` field (the
`TasoTeamStanding` type from part 1) and the value itself otherwise. A
pass-through team's name is plain text, not a link, when
`teamProviderId === 0` (the `toPassThroughStanding` fallback for a team
missing `team_id` — defensive, not expected to ever actually happen, but
correctly not producing a nonsensical `/kotimaa/joukkue/0` link if it did).

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 382 unit tests passing (up from 306 after part 1), 100% statement/branch/
  function/line coverage on every file this PR touches (the one remaining
  branch gap, `src/lib/redis.ts`, predates this PR and this feature
  entirely — confirmed via `git diff main`).
- 21 integration tests (unchanged from part 1 — no new DB-layer behavior in
  this PR).
- **34 e2e tests passing locally against a real dev server, real Postgres/
  Redis, and both live APIs** (football-data.org and TASO, the latter using
  the real scraped key) — 16 new (`kotimaa-standings.spec.ts`,
  `kotimaa-matches.spec.ts`, `kotimaa-team.spec.ts`, plus the extended
  `picker.spec.ts`), 18 pre-existing (2 of which needed updating for the
  region-picker restructure: `picker.spec.ts`'s whole flow, and
  `standings.spec.ts`'s "Etusivu returns to the picker" assertion, which
  now expects "Valitse alue" instead of "Valitse kilpailu"). Confirmed
  live, not just asserted: 2025's three-group split (Runkosarja/
  Mestaruussarja/Karsintasarja) all render; 2015 renders a single table
  with TASO's `"1"` group_name displayed as "Runkosarja"; a top-of-table
  2025 Runkosarja team's match list spans more than one `group_name`,
  confirming the carry-over/cross-group team-page behavior end-to-end
  against real data, not just fixtures.

---

## Part 2 review pass: two real bugs found against live data

The UI PR was reviewed end-to-end against the live TASO API before merge.
Two genuine bugs surfaced, both in part 1's data layer rather than the UI,
and both invisible to the test suite as it stood.

### A carry-over group listed every parent-group team

`getSeasonStandings` fed a continuation group's combined match list
(parent + own) to `calculateStandings` as *both* the stats source and the
roster. The roster argument seeds a row per team, so 2025's Mestaruussarja
rendered all **12** Runkosarja teams instead of its own 6 — the 6 extras
sitting at 22 played among teams on 32, which looks plausible enough at a
glance to survive review.

Fixed by filtering the combined table back down to the teams that actually
appear in the group's own matches, then renumbering positions from 1 (which
also matches TASO's own `final_group_standing`, relative to its group per
the spec's Out of scope). Filtering the *matches* instead would have been
wrong: a Mestaruussarja team's Runkosarja points include matches against
teams that went on to Karsintasarja, so dropping those would under-count it
— KuPS 2025 would lose points off its real 67.

Verified against live 2025 data: Runkosarja/Mestaruussarja/Karsintasarja now
return 12/6/6 rows with every team's points, matches played, *and* position
matching TASO's own published numbers — zero mismatches.

### One dateless match took down a whole season

`parseKickoff` threw on an unparseable kickoff. `normalizeTasoMatch` is
built to return `null` for an unusable row so `getSeasonMatches` can skip
it, but a throw escaped that and failed the entire season sync. 2022's
Eurolopputurnausfinaali contains exactly one such match — already played,
but TASO never recorded a date or time for it — so **the whole 2022 season
rendered the error state**. An unparseable kickoff is now treated like any
other incomplete row: skipped, with a warning logged so it stays visible.

### Why the tests missed both

The spec's acceptance criteria call for verifying a season with 5 groups
(2022) and one with 3 (2025). Neither had any coverage: 2022 was never
loaded at all, and the 2025 e2e test counted *tables* but not *rows*. Both
gaps are now closed — plus unit regression tests for the roster fix and the
skipped-kickoff path, and an e2e assertion that a split group reproduces
TASO's own published points and positions.

## Sourcery: a shaped-but-invalid kickoff is not a valid one

Making `parseKickoff` return `null` fixed the throw above, but it still
accepted anything the three regexes matched — `2026-99-99 25:00 +0099`
passes all of them, and `Date.UTC` silently normalizes each out-of-range
component into a real, wrong instant. The failure mode is worse than the
original crash: instead of skipping an unusable provider row the sync would
store and display a match at a kickoff it never had, with nothing logged.

Ranges are now checked before the `Date` is built. Hour, minute, and both
offset components get direct bounds; the calendar date is validated by
round-tripping it through `Date.UTC`, which is the only check that catches
both an out-of-range month and a day that doesn't exist in its month
(`2026-02-31` rolls forward into March rather than failing). Seven
table-driven cases cover it.

## Duplication and shared components

SonarCloud's duplication gate drove out four shared pieces, each replacing
markup that had been copy-pasted between the football-data and `/kotimaa`
sides: `Notice` (the amber fallback banner, also fixing every `role="status"`
accessibility finding at once by using `<output>`), `MatchListTable`,
`StandingsTable`/`StandingsLegend`, `SeasonForm`, and a shared
`useSeasonRoundNavigation` hook. New-code duplication went 15.8% → **0.0%**
and all 13 code smells are resolved.

## Per-request sync deduplication

`getSyncedSeasonMatches` is now wrapped in React's `cache()`, matching
`getSeasonContext`/`getTeamMatches` in the football-data services. Without
it the standings page synced twice per render (once for the round list,
once for the tables) and the team page twice per request (Next.js invokes
`generateMetadata` and the default export separately) — on a stale current
season that meant fetching TASO's ~1 MB season response and re-upserting
every row twice over.

## Known limitation: the season range is hardcoded

`EARLIEST_TASO_SEASON`/`LATEST_TASO_SEASON` are `2015`/`2026`, matching the
spec's fixed 2015–2026 range. `LATEST_TASO_SEASON` doubles as the "current
season" for cache-freshness, so when 2027 starts it needs a one-line bump
or the new season is neither listed nor refreshed. Deliberately left as-is
rather than derived from the clock: deriving it would make the app default
to a `competition_id` TASO may not publish until the season is close, which
fails worse and less visibly. Worth a follow-up issue before the 2027
season opens.

