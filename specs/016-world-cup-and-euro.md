# 016 — World Cup and European Championship

## Summary

Add a third region to the landing page — `Maajoukkueet` — and populate it with
the FIFA World Cup and the European Championship.

## Scope

### In scope

- A third region on `/`, and the region picker behind it.
- **`WC`** (FIFA World Cup) and **`EC`** (European Championship) added to the
  football-data.org registry, both as `cup` format.
- Standings, match list and team pages for the region, reusing what
  specs/014-champions-league.md built.
- A **base path** on the controls that hardcode `/ulkomaat` today, so one set
  of pages can serve two regions.

### Out of scope

- **Huuhkajat (#166) and Helmarit (#167)**, which belong to this region but
  come from TASO and arrive as their own features. The region is built so they
  can join without moving.
- Champions League, which stays under `Ulkomaat`.
- Any competition beyond `WC` and `EC`.
- Changing how `/ulkomaat` or `/kotimaa` render — **with one exception**, added
  in review: `StandingsTable`'s numeric columns now stay grouped instead of
  spreading across the table's full width. A four-team World Cup group made the
  problem obvious (four short names, the numbers strung across ~700px), but the
  component is shared, so every league table gets the same fix. Deliberate and
  recorded rather than pretended away.

## What specs/014 already provides

Verified on `main` after #168 and #171 merged:

- `LAST_32` (`Kahdeksannesvälierät`) and `THIRD_PLACE` (`Pronssiottelu`) are
  **already named** — added during #168's review round precisely so this
  feature would not ship raw identifiers.
- `isDrawnStage` already excludes both, so `LAST_32` (16 ties) and the
  third-place match are listed rather than drawn.
- `buildBracket` already handles single-leg ties, and `orderRoundsForTree`
  already keeps a tie that feeds nothing at the end rather than dropping it —
  which is exactly a third-place match.
- The `stage`/`group_name` columns and the score breakdown are stored.

So this feature adds a region and two registry entries. The only new rendering
problem is the matchday one below.

## The region

`/maajoukkueet` → `src/app/national-teams/`, matching the Finnish-URL /
English-folder split in specs/012-finnish-urls-english-code.md:

| Public URL | Folder |
|---|---|
| `/maajoukkueet` | `/national-teams` |
| `/maajoukkueet/sarjataulukko` | `/national-teams/standings` |
| `/maajoukkueet/ottelut` | `/national-teams/matches` |
| `/maajoukkueet/joukkue/:id` | `/national-teams/team/:id` |

Each needs its rewrite, plus the redirects that close the English spelling and
the folder path — the table in `next.config.ts` already does this for both
existing regions and must stay symmetrical.

### Why a region rather than more entries under `/ulkomaat`

Adding `WC` and `EC` to the existing foreign picker would be a two-line change
and no new routes. It is rejected for two reasons:

1. **#166 and #167 land here next**, and they are TASO-backed national teams.
   They cannot go under `/ulkomaat`, whose pages are football-data-only. The
   region has to exist for them regardless, so building it now avoids moving
   `WC`/`EC` later.
2. `Ulkomaat` means foreign *leagues*. A tournament between national teams is
   a different thing to a reader, which is the whole reason the landing page
   has regions at all.

### The cost: a base path on the controls

Six components hardcode `/ulkomaat` as their form action or `router.push`
target: `standings-controls`, `cup-standings-controls`, `matches-controls`,
`cup-matches-controls`, `team-season-selector`, and
`use-season-round-navigation`. Each gains a `basePath` prop, and the three
`/foreign` pages pass `"/ulkomaat"` while the new `/national-teams` pages pass
`"/maajoukkueet"`.

This is a mechanical refactor with no behaviour change for `/ulkomaat`, and it
is the bulk of this feature's diff. Its regression test is that every existing
`/ulkomaat` test keeps passing untouched.

## UX / UI (Finnish strings)

### Landing page (`/`)

A third tile joins `Kotimaa` and `Ulkomaat`:

- Label **`Maajoukkueet`**
- Description **`Arvokisat ja maaottelut`**

One word, like the two tiles beside it, and accurate for everything the region
will hold: the World Cup and the Euro are competitions *between* national
teams, and #166/#167 add Finland's own. The description covers both halves so
it will not need rewriting when they land.

**Not `Kansainväliset`**, which was the working name: `Ulkomaat`'s own
description already reads `Kansainväliset sarjat`, so the same word would
appear on two tiles meaning different things. `Ulkomaat`'s description is left
alone — with the region renamed there is no longer a clash to fix, and changing
it is out of scope.

### Region picker (`/maajoukkueet`)

Heading `Valitse kilpailu`, as `/ulkomaat` uses. Two entries:

- **`MM-kisat`** — flag: the World area flag, alt text `Maailma`
- **`EM-kisat`** — flag: the Europe area flag, alt text `Eurooppa`

### Standings, matches, team

As the Champions League rendering from specs/014 — group tables under
`Lohko A` … `Lohko L`, knockout rounds listed, closing rounds drawn as a tree —
with four differences settled in review.

**No `Kilpailu` select.** `/ulkomaat`'s competitions are interchangeable views
of the same kind of thing, so switching between them mid-page is useful. The
World Cup and the Euro are separate tournaments reached from the region picker,
and a dropdown between them reads as if one were a variant of the other. Only
`Kausi` is offered.

**A listed round leads with its date, and says `Lopputulos`.** A single-leg
round has no aggregate — the tie *is* the match — so `Yhteistulos` would be
claiming something that does not exist, and the per-leg column would repeat the
date already in the first column. Columns become `Pvm | Ottelupari |
Lopputulos`. A two-legged round keeps `Yhteistulos` and its `Osaottelut`
column, which after specs/016 means Champions League only.

**Country names are Finnish.** football-data reports national teams in English
— `Netherlands`, `Ivory Coast`, `Czechia`. A Finnish app showing those on a
page headed `MM-kisat` is half-translated. `toFinnishCountryName` maps the 59
countries appearing in WC 2026 and Euro 2024, applied once where the data
enters a page so the tables, bracket, match list and team page all agree. An
unmapped country falls through to the provider's name: readable-but-English
beats a mangled guess.

This is only needed on the football-data side. **TASO already publishes Finnish
names** — `Suomi`, `Valko-Venäjä`, `Alankomaat` — so #166 and #167 get it free.

**Club names are never translated.** The map is applied only in the
national-teams region; `Paris Saint-Germain FC` stays as it is.

## API & Data

### Endpoints — no new provider surface

The two endpoints already in use, with the existing TTLs:
`GET /v4/competitions/{code}` (3600 s) and
`GET /v4/competitions/{code}/matches?season={id}` (900 s).

### Exactly one reachable season each (verified live 2026-08-26)

| Competition | Reachable | Everything else |
|---|---|---|
| `WC` | **2026 only** | 2024, 2025 → 403 |
| `EC` | **2024 only** | 2023, 2025 → 403 |

`listSelectableSeasons` is bounded by `FOOTBALL_DATA_EARLIEST_SEASON=2023` and
the competition's own `currentSeason`, so both already resolve to a single
option. The season selector still renders, showing that one option: hiding it
would make the page inconsistent with every other competition for no gain, and
a second season becomes reachable the moment the plan changes.

### Stage shapes

**WC 2026** — 104 matches, 48 teams, 12 groups:
`GROUP_STAGE` (72) → `LAST_32` (16) → `LAST_16` (8) → `QUARTER_FINALS` (4) →
`SEMI_FINALS` (2) → `THIRD_PLACE` (1) → `FINAL` (1)

**EC 2024** — 51 matches, 24 teams, 6 groups:
`GROUP_STAGE` (36) → `LAST_16` (8) → `QUARTER_FINALS` (4) → `SEMI_FINALS` (2)
→ `FINAL` (1)

### The matchday problem — a correction to #165's notes

The issue states that knockout `matchday` is `null`. That is true for **WC
2026** and **false for EC 2024**, which continues the group-stage counter:
its knockout matchdays are **4, 5, 6, 7**.

This matters because `/ulkomaat/ottelut` labels a knockout stage's fourth
column `Osaottelu` (leg) and prints `matchday`. For EC that would read
`Osaottelu 4` for a single-leg tie — a leg number that is not a leg number.

**Rule:** the leg column appears only when the stage is actually two-legged,
decided from the data — a stage where some team pair appears twice. A
single-leg knockout stage renders no fourth column at all, which is right for
both WC (`null`) and EC (4–7), and leaves Champions League unchanged, where
every knockout stage genuinely has two legs.

## Edge Cases

- **EC's continued matchdays (4–7)** — no leg column, per the rule above.
- **WC's null matchdays** — same rule, same outcome, different cause.
- **`THIRD_PLACE`** — listed, never drawn; `isDrawnStage` already excludes it,
  and `orderRoundsForTree` already keeps a tie that feeds nothing at the end.
- **`LAST_32` at 16 ties** — listed, not drawn; too wide for a tree.
- **A one-option season selector** — renders normally, showing one option.
- **`kausi=2025` for `WC`** — outside `listSelectableSeasons`, so rejected by
  `parseSeasonParam` before any provider call; the 403 is never reached. This
  needs a **per-competition season floor**: the plan-wide floor is 2023, and
  without one the selector would offer 2023–2026 for a competition that only
  answers for 2026. `earliestSeason` on the registry entry: 2026 for `WC`,
  2024 for `EC`.
- **A tournament's season label** — `2026`, not `2026/27`. Read from the
  provider's own dates: WC runs 2026-06-11 → 2026-07-19 and EC
  2024-06-14 → 2024-07-14, both inside one calendar year, while CL runs
  2025-09-16 → 2026-05-30. A season with no end date is treated as spanning,
  which is what every league does.
- **A country with no Finnish mapping** — falls through to the provider's
  English name rather than being guessed at.
- **A team page reached from this region** — links stay inside
  `/maajoukkueet`, so a reader is not bounced to `/ulkomaat`.
- **`/ulkomaat` must not list `WC` or `EC`**, and `/maajoukkueet` must not
  list the ten `Ulkomaat` competitions. The registry needs a region per
  competition, not one flat list.
- **An unknown `kilpailu` on a region page** — falls back to that region's
  default competition, not to `PL`.

## Performance & Limits

- No new requests; both endpoints are already cached.
- Largest response is WC 2026 at 104 matches — smaller than a 380-match league
  season.
- WC renders 12 group tables of 4 rows. The 2023 Champions League page already
  renders 8, so this is the same shape one third larger.

## Security & Secrets

- No new environment variables.
- `kilpailu` is validated against the **region's own** competition list before
  reaching a provider URL, cache key or query. A code valid in one region must
  not be accepted in another.
- No secrets committed.

## Acceptance Criteria

- [ ] `/` shows a third tile, `Maajoukkueet`, alongside `Kotimaa` and `Ulkomaat`.
- [ ] `/maajoukkueet` lists `MM-kisat` and `EM-kisat`, and nothing else.
- [ ] `/ulkomaat` still lists exactly its ten competitions, unchanged.
- [ ] WC 2026 renders 12 group tables, `Lohko A` … `Lohko L`.
- [ ] EC 2024 renders 6 group tables, `Lohko A` … `Lohko F`.
- [ ] WC 2026 lists `Kahdeksannesvälierät` and `Pronssiottelu`, and draws
      Puolivälierät → Välierät → Loppuottelu, with Spain the winner.
- [ ] EC 2024 has no `Kahdeksannesvälierät` and no `Pronssiottelu`.
- [ ] Neither competition's match list shows a leg column, at any stage.
- [ ] Champions League's match list still shows `Osaottelu` for its
      two-legged knockout stages.
- [ ] The season selector offers 2026 for `WC` and 2024 for `EC`.
- [ ] Links from a `/maajoukkueet` page stay in `/maajoukkueet`.
- [ ] Neither competition offers a `Kilpailu` select; both offer `Kausi`.
- [ ] A single-leg round's table reads `Pvm | Ottelupari | Lopputulos`, and a
      two-legged one still reads `Yhteistulos` with its `Osaottelut` column.
- [ ] Country names render in Finnish — `Alankomaat`, `Norsunluurannikko`,
      `Yhdysvallat` — and no English name is left on the page.
- [ ] A club name is never translated.
- [ ] The heading reads `MM-kisat 2026`, not `MM-kisat 2026/27`.
- [ ] A standings table's numeric columns stay grouped rather than spreading
      across the full width.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/competitions.test.ts`
  - `WC` and `EC` exist, are cups, and belong to the national-teams region.
  - The ten `Ulkomaat` competitions are unchanged and still in their region.
  - `parseCompetitionParam` rejects a code from another region.
- `tests/unit/lib/cup-stages.test.ts`
  - Two-legged detection: a stage with a repeated pair is two-legged; one with
    all-distinct pairs is not, whether matchdays are null or 4–7.
- `tests/unit/app/national-teams/**` — the three pages render, and their links
  carry `/maajoukkueet`.
- `tests/unit/components/*-controls.test.tsx` — each control posts to the base
  path it is given.
- `tests/unit/app/foreign/**` — unchanged, and passing, as the refactor's
  regression test.
- `tests/e2e/national-teams.spec.ts` — the region tile leads to WC 2026's 12
  group tables and its bracket.

## Files To Update

- `specs/016-world-cup-and-euro.md` — this file.
- `src/lib/competitions.ts` — `WC`/`EC`, and a region per competition.
- `src/app/page.tsx` — the third tile.
- `src/app/national-teams/{page,standings,matches,team/[id]}` — the region.
- `src/components/` — `basePath` on the six coupled components.
- `src/lib/cup-stages.ts` — two-legged detection.
- `src/app/foreign/matches/page.tsx` — use it for the leg column.
- `next.config.ts` — rewrites and redirects for the new region.
- `decisions/016-world-cup-and-euro.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

None outstanding.
