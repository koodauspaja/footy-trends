# 009 — Veikkausliiga standings (TASO)

## Summary
Adds Veikkausliiga (Finland's top football tier) standings, match lists, and team pages, sourced from TASO (`spl.torneopal.net/taso/rest/`) rather than football-data.org — the first Finnish competition in the app, and the first from a second data provider.

> **Superseded in part.** Two later specs change behaviour described below;
> this spec is otherwise current.
>
> - `specs/010-playoff-group-match-list.md` (#126) — Eurolopputurnaus-shaped
>   groups render as a match list, **not** a pass-through table with "–"
>   stats. Affects the Scope, Edge Cases, and Acceptance Criteria mentions
>   of pass-through for those groups.
> - `specs/011-current-season-discovery.md` (#124) — the season range is
>   2015 up to the season **discovered from TASO**, not a fixed 2015–2026.
>   Affects every "2015–2026" and "2026 down to 2015" mention below, and
>   the caching section's "current season (2026)".

## Scope

### In scope
- A new `/kotimaa/sarjataulukko?kilpailu=VL` page showing Veikkausliiga standings, seasons 2026 down to 2015 (TASO `competition_id`s `spljp26`…`spljp15`).
- A new `/kotimaa/ottelut?kilpailu=VL` season-wide match list, mirroring spec 005, for the same 2015–2026 season range.
- A new `/kotimaa/joukkue/:id?kilpailu=VL` team match list, mirroring spec 004. A team can appear in more than one group within a season (Runkosarja, then Mestaruussarja or Karsintasarja) — its page lists matches chronologically across all of that season's groups, same as spec 004's page has no notion of "group" at all today.
- Raw matches are synced and stored for **every** season 2015–2026, needed uniformly for the match-list and team pages regardless of how standings for a given group are computed.
- One standings table per group TASO returns for that season, rendered generically (whatever `group_name`s and however many groups exist) — no hardcoded assumption of "Runkosarja + 2 split groups". Confirmed from real data this varies by era:
  - 2015, 2018: a single flat group (triple round-robin, 33 rounds). TASO's own `group_name` for it is literally the string `"1"` — displayed as **"Runkosarja"** instead, per your domain knowledge that this was the era's name for the (only) phase. Not independently confirmed via the API (`category_notice` is empty for these seasons) — flagged in Edge Cases as an assumption, not a verified fact.
  - 2021–2024: Runkosarja → Mestaruussarja + a lower group (named "Haastajasarja" in 2021, "Karsintasarja" from 2025) — plus, in 2022–2024 only, an additional "Eurolopputurnaus" (and in 2022 a further 2-team "Eurolopputurnausfinaali") group. These extra groups render exactly like any other group — no special-casing, no bracket/playoff UI (that's genuinely a different competition shape, deferred to whenever #68's playoff-format design exists).
  - 2025–2026: Runkosarja → Mestaruussarja + Karsintasarja.
- **Own-calculation with a round selector, for every group and every season 2015–2025** (2026 joins once it splits — see below). Concretely:
  - **Every season's first/origin group (`group_id=1` in every season checked, or the sole group in 2015/2018) is always own-calculated.** It has no carry-over dependency by construction. `round_id` confirmed populated and complete back to 2015 (1–33 for 2015/2018's 33-round triple round-robin, 1–22 for the double-round-robin Runkosarja from 2021 on) — `calculateStandings` fed that group's own matches, using TASO's raw `round_id` values directly as the round numbers.
  - **Mestaruussarja and its lower-group counterpart (Haastajasarja 2021, Karsintasarja from 2025) are own-calculated for 2021–2025** via a confirmed carry-over entry (`group_id → parent group_id = 1`) — verified two ways: TASO's own `starting_points` field (populated 2021–2024, equals the team's exact Runkosarja points every single time — 0 mismatches checked across all teams, all four years) and, for 2025 where TASO stopped populating `starting_points` (always `0` that year despite the carry-over still happening), by directly combining Runkosarja + Mestaruussarja matches through `calculateStandings` and confirming the result matches TASO's own final numbers exactly (e.g. 2025 KuPS: 67 points / 32 played, matching TASO exactly). **2026's split groups don't exist yet** — once they do, re-validate the same way before enabling; extremely likely to hold given 5/5 prior seasons confirmed, but not assumed ahead of the data existing.
  - **Eurolopputurnaus (and 2022's Eurolopputurnausfinaali) does not carry over, and isn't a points competition at all**: TASO's own `points`/`starting_points` fields are `null` for every team in this group, every year checked (2022–2024) — confirmed structurally different (almost certainly knockout-shaped, consistent with why it's deferred to #68's playoff-format work rather than built here). Rendered via pass-through, gracefully handling `null` fields (shown as "–", matching how the existing app already renders an unplayed match's score) — not own-calculated, not expected to ever be, until it gets real playoff/bracket UI.
- Standard `calculateStandings` tie-break order (points → goal difference → goals scored → name) is used for every own-calculated group, **not** Veikkausliiga's official conditional tie-break (away goals conceded → home goals scored → home goals conceded → lot/replay, which only applies when a medal/UEFA/relegation position is actually at stake). Confirmed in chat: documented gap, not built for v1 — see Edge Cases.
- A `VEIKKAUSLIIGA` Finnish flag/crest and name entry, shown the same visual way the existing picker shows a competition, but linked from `/kotimaa/` rather than added to the existing `/sarjataulukko` picker's `kilpailu=` list.
- `TASO_API_KEY` env var (the scraped key, kept out of every tracked file — see Security & Secrets) — code builds the required `Accept: json/${TASO_API_KEY}` header. `Referer`/`Origin`/`User-Agent` headers matching the real tulospalvelu.palloliitto.fi frontend are required too (confirmed: TASO returns 403 without them) but are fixed values, not secrets — hardcoded constants, not env vars.

### Out of scope
- Any other Finnish competition (Ykkösliiga, Suomen Cup, women's/junior categories) — tracked as future work per #88's own notes; this spec is Veikkausliiga only.
- Renaming/moving the existing football-data.org routes (`/sarjataulukko`, `/ottelut`, `/joukkue/:id`) under `/ulkomaat/` for symmetry with the new `/kotimaa/` section. Confirmed in chat: this stays as-is (top-level, unchanged) for now — the rename is its own separate, focused follow-up spec, not bundled into this data-source feature. When that follow-up happens, it should redirect the old top-level URLs rather than just breaking them (confirmed in chat) — noted here for whoever picks it up.
- A merged/combined single 1–12 table across split groups. Confirmed: `final_group_standing` is relative to its own group (1–6 in both Mestaruussarja and Karsintasarja, not offset to 7–12), so separate tables per group is both the simpler build and the accurate one — no merge math to get right or get wrong.
- Veikkausliiga's official conditional tie-break cascade — see In Scope and Edge Cases.
- Auth-key rotation tooling/alerting. The spike in #88 already flagged this as a real operational gap (the key is scraped, not a registered credential); this spec ships with a documented manual re-scrape procedure (see Security & Secrets) but not automated monitoring.

## UX / UI (Finnish strings)
- Page heading: `Veikkausliiga {season}` (e.g. `Veikkausliiga 2026`), matching the `{competition} {season}` pattern used by `/sarjataulukko`.
- Each group renders under its own heading, using TASO's own `group_name` verbatim (e.g. "Runkosarja", "Mestaruussarja", "Karsintasarja") — already Finnish, sourced directly rather than translated by us — except 2015/2018's group, shown as "Runkosarja" per the fallback above.
- Table columns: same Finnish abbreviations as the existing standings table (O/V/T/H/TM/PM/ME/P) — same `TeamStanding` shape and same table component regardless of whether a group is own-calculated or pass-through; only the data-fetching path differs.
- Round selector, shown only for a group that's own-calculated. Finnish labels "Kierros" / "Koko kausi", same as the existing `StandingsControls` pattern, using TASO's own `round_id` numbers directly (e.g. Mestaruussarja's rounds show as "Kierros 23" onward, continuing the season's real numbering, not re-indexed to start at 1).
- Season selector: 2026 down to 2015 — Veikkausliiga's season is a single calendar year (e.g. "2026"), not a year-spanning one like the foreign leagues, so the label is just the year.
- `/kotimaa/ottelut`: same Finnish copy and layout as `/ottelut` (date/teams/result columns, "Sarjataulukkoon" back-link per spec 007), plus each match's `group_name` shown (a match list spanning a season with 3 groups needs to distinguish which group a match belongs to, unlike the existing single-group `/ottelut`).
- `/kotimaa/joukkue/:id`: same Finnish copy and layout as `/joukkue/:id`, plus each match's `group_name`, since a team's chronological match list can cross group boundaries.
- Error/empty states reuse the existing Finnish copy: `"Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen."` / `"Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen."` / `"Joukkuetta ei löytynyt."` for provider failures and not-found states.

## API & Data
- **New client module** (`src/lib/taso.ts`, mirrors `src/lib/football-data.ts`): wraps `spl.torneopal.net/taso/rest/{getGroups,getMatches}`, attaches the required headers, and normalizes responses.
- **Normalization**: TASO match fields map onto the same `NormalizedMatch`/`RosterMatch` shapes `src/lib/standings.ts` already defines (confirmed: `team_A`/`club_A` = home, verified via venue-city and `team_A_home_venue_id` matching the match's own `venue_id`) — `status: "Played"` → `"FINISHED"`, `"Fixture"` → `"SCHEDULED"`, `round_id` → `matchday`. This means **`calculateStandings` itself is reused as-is** for every own-calculated group, including spec 008's roster-seeding behavior (a winless team early in a group's own matches gets a zero-stats row, for free).
- **Carry-over config**: a small, explicit map (`competitionId + groupId → parentGroupId | null`) living in code, not the database — it's a handful of confirmed facts, not user data. `group_id=1` needs no entry (implicitly parentless). Ships with confirmed entries for `spljp21`…`spljp25`, each `{ "2": "1", "3": "1" }` (Mestaruussarja/Haastajasarja-or-Karsintasarja from Runkosarja) — validated per season against TASO's own numbers (see Tests Required). Eurolopputurnaus-shaped groups (`group_id=4`/`5` in 2022–2024) get no entry: confirmed `null`-valued, not a points competition, rendered pass-through only. `spljp26` gets the same `{ "2": "1", "3": "1" }` entry once its split groups exist and are re-validated (not assumed ahead of the data existing).
- **Storage**: a new `taso_matches` table (own schema, own uniqueness on `match_id` — TASO's match IDs are a separate numeric space from football-data.org's and could otherwise collide if sharing the existing `matches` table's `provider_match_id` unique index), storing raw matches for every season 2015–2026. Adds `group_id`/`group_name` columns the existing `matches` table has no equivalent for.
- **Standings for a non-own-calculated group**: `getGroups`' response (already-computed standings) is additionally cached in Redis via the existing `getCached` helper and read directly at render time — separate from the `taso_matches` row storage, since it's TASO's precomputed output, not something derived from the stored matches.
- **Caching TTLs**: current season (2026) matches/groups: `15 * 60` seconds, matching `MATCHES_CACHE_TTL_SECONDS` in `football-data.ts`. Completed seasons (2015–2025): effectively never refreshed once synced, following the same "past season never goes stale" rule `needsRefresh` already implements for football-data.org.
- **Auth**: `TASO_API_KEY` read server-only (never sent to the client), same as `FOOTBALL_DATA_API_KEY`. `Referer`/`Origin`/`User-Agent` are fixed constants (confirmed required: the API 403s without them — this isn't real CORS, it's server-side origin validation, so it must be set on every server-to-server request, not just conceptually "a browser thing").

## Edge Cases
- A season/group where every match is still a `"Fixture"` (unplayed) — same zero-stats-row behavior as spec 008, verified live (2026's Runkosarja before it started would have shown this).
- A `group_id` that appears mid-season (Mestaruussarja/Karsintasarja don't exist in TASO's response until Runkosarja concludes) — the page just renders whatever groups the API currently returns; no assumption that a fixed set of groups always exists.
- An unusual bonus group (Eurolopputurnaus-shaped) — rendered like any other group (pass-through, no carry-over entry — confirmed it isn't a points competition at all: `points`/`starting_points` are `null` for every team, every year checked), not filtered, not specially laid out. Its table shows "–" for null stat fields rather than crashing or printing "null".
- 2015/2018's single group is displayed as "Runkosarja" though TASO's own `group_name` field for it is just `"1"` — this is domain knowledge supplied in chat, not confirmed via the API itself (`category_notice` is empty for those seasons). If it turns out to be wrong, it's a one-line display fix, not a data problem — the underlying `group_id` used for lookups is unaffected either way.
- `getGroups`/`getMatches` returning a 403 (missing/expired auth headers, or a scraped key that's stopped working) — same generic Finnish error message as a football-data.org failure; logged with enough detail (status code, endpoint) to distinguish "TASO key needs re-scraping" from "TASO is down" during triage.
- A team appearing in more than one group within a season (Runkosarja, then Mestaruussarja or Karsintasarja) — `/kotimaa/joukkue/:id` lists its matches chronologically across all of them, labeled by `group_name`.
- `phase_number` is confirmed unreliable for ordering groups (Runkosarja showed `phase_number: 2` while its own split groups showed `phase_number: 1` in the 2025 data checked) — group display order must not depend on it. Use `group_id` ascending instead (confirmed consistent: 1 = Runkosarja, 2/3 = the split groups, higher numbers = any bonus groups, in every season checked).
- An exact points + goal-difference + goals-scored tie at a medal/UEFA/relegation-significant boundary — `calculateStandings`'s standard tie-break (falls through to alphabetical) can order two teams differently than Veikkausliiga's official cascade would. Rare (needs a three-way-identical tie on all three figures simultaneously) but real; documented here rather than silently accepted.
- A carry-over config entry that's wrong — caught by the validation described in Tests Required before it ships, not discovered live. Applies going forward too: 2026's split groups get the same validation once they exist, before their entry is added.

## Performance & Limits
- No usage limit assumed for the TASO API (confirmed in chat) — caching (above) is still in place for its own sake (avoiding redundant work, not rate-limit avoidance), same posture as football-data.org.
- No new client-side requests — all TASO calls happen server-side, same architecture as football-data.org.

## Security & Secrets
- `TASO_API_KEY` in `.env.example` (empty value) and read server-only, never logged, never sent to the client.
- Documented manual re-scrape procedure (in `docs/setup/` or this spec's decision record) for when the key stops working: open tulospalvelu.palloliitto.fi's network tab, find a `taso/rest/` request, copy the `Accept` header's value after `json/`.
- No secrets committed. (The spec draft itself briefly had the real scraped key pasted into it during writing — caught and removed before anything was committed; a reminder to double check example values in specs never carry a real secret.)

## Acceptance Criteria
- [ ] `/kotimaa/sarjataulukko?kilpailu=VL` shows Veikkausliiga standings for the current season by default.
- [ ] A season selector covers 2015–2026, shared across the standings, match list, and team pages.
- [ ] Every season's `group_id=1` (Runkosarja, or the sole group in 2015/2018) has a working round selector, standings matching a from-scratch `calculateStandings` run over that group's own matches.
- [ ] 2021–2025's Mestaruussarja and Haastajasarja/Karsintasarja groups have a working round selector; standings at the final round match TASO's own `current_standing`/`points`/etc. for that group exactly.
- [ ] Eurolopputurnaus-shaped groups (2022–2024) render via pass-through with no round selector, showing "–" for their null stat fields rather than crashing or printing "null".
- [ ] Every group TASO returns for a season renders as its own table, using TASO's own `group_name` (except the 2015/2018 fallback), in `group_id` ascending order — verified against at least one season with 1 group (2015), one with 3 (2025), and one with 5 (2022, includes the bonus groups).
- [ ] `/kotimaa/ottelut?kilpailu=VL` lists a season's matches (any of 2015–2026) with date, teams, result, and group name; a back-link to `/kotimaa/sarjataulukko`.
- [ ] `/kotimaa/joukkue/:id?kilpailu=VL` lists a team's matches for a season across every group it appeared in that season, chronologically; a back-link to `/kotimaa/sarjataulukko`.
- [ ] A TASO request failure shows the same generic Finnish error message as the existing standings/matches page's provider-failure state, on all three pages.

## Tests Required
- `tests/unit/lib/taso.test.ts`: normalization of `getMatches`/`getGroups` responses into `NormalizedMatch`/`RosterMatch` and TASO-specific group metadata; `"Played"`/`"Fixture"` → `"FINISHED"`/`"SCHEDULED"` mapping; required-header construction (without asserting the literal key value).
- `tests/unit/lib/taso-standings-service.test.ts`: own-calculation reuses `calculateStandings` correctly per group (including the carry-over combine step for a configured continuation group, the round-filter, and the winless-team case); pass-through path maps TASO's precomputed fields into the same `TeamStanding` shape without recalculating; group ordering by `group_id` regardless of `phase_number`; season-wide match list and a team's cross-group match list.
- **Carry-over validation** (fixture-based, not live-API, so it's deterministic in CI): for each configured carry-over entry (2021–2025's Mestaruussarja and Haastajasarja/Karsintasarja), assert that combining the parent + child group's fixture matches through `calculateStandings` reproduces the exact `points`/`matches_played`/etc. captured from TASO at the time this spec was validated — a regression guard against a future config entry being added without checking it first.
- `tests/unit/app/kotimaa/sarjataulukko/page.test.tsx`, `tests/unit/app/kotimaa/ottelut/page.test.tsx`, `tests/unit/app/kotimaa/joukkue/[id]/page.test.tsx`: rendering, group labeling, round-selector visibility per group's carry-over config, error states — mirroring the assertion style of the existing `/sarjataulukko`, `/ottelut`, `/joukkue/[id]` test files.
- `tests/integration/taso.test.ts`: `taso_matches` sync/round-filtering/team-match-lookup against a real Postgres, mirroring `tests/integration/standings.test.ts`'s pattern.

## Files To Update
- `specs/009-veikkausliiga.md` (this file)
- `src/lib/taso.ts` (new)
- `src/lib/taso-standings-service.ts` (new — includes the carry-over config)
- `src/db/schema.ts` (new `taso_matches` table + migration)
- `src/app/kotimaa/sarjataulukko/page.tsx`, `src/app/kotimaa/ottelut/page.tsx`, `src/app/kotimaa/joukkue/[id]/page.tsx` (new)
- `.env.example` (`TASO_API_KEY`)
- `tests/unit/lib/taso.test.ts`, `tests/unit/lib/taso-standings-service.test.ts`, `tests/unit/app/kotimaa/**/page.test.tsx`, `tests/integration/taso.test.ts`
- `decisions/009-veikkausliiga.md` (written during implementation)
- `docs/setup/` (new doc: TASO key re-scrape procedure)

## Open Questions
- 2026's carry-over entry: the pattern has now held for 5/5 seasons checked (2021–2025), so it's expected to hold once 2026 splits, but not assumed ahead of the data existing — re-validate the same way before enabling that season's round selector for Mestaruussarja/Karsintasarja.
