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
