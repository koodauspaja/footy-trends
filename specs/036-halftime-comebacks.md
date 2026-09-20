# 036 — Comebacks from a half-time deficit

> **Status: every question answered on 2026-09-20; awaiting go.** Nothing is
> implemented until a human says **go**.

## Summary

How often a team recovers from losing at half-time: how many matches it trailed
at the break, and what became of them. The other panels describe how a season
went; this one describes character — a team that rescues points after going
behind is a different team from one that never does.

**It is the first analytics feature that needs data the app does not store.**
Both providers return a half-time score; neither is stored today. That, not the
arithmetic, is the work.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit`, following the page's
  season selector.
- Both providers, football-data.org and TASO.
- **League format only**, as the other panels (#425 revisits that rule).
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- **Storing the half-time score**: a column on `matches` and `taso_matches`, the
  sync change for both providers, and a backfill of what the providers still
  serve.
- **Saying so when the data is missing**, per match, not only per season, **without hiding the figures that are known** (Q4).

### Out of scope

- "Who scored first" and goal times. Neither provider gives events here; that is
  why #335 was rewritten (see the issue).
- Blown leads — led at half-time, did not win. The mirror measure, filed as #429 (Q2).
- Half-time figures on the other panels or charts.

## UX / UI (Finnish strings)

**Where:** `Analyysit`, after `Putket` (Q6).

| String | Where | Status |
|---|---|---|
| `Käännetyt ottelut` | panel subheading | settled (Q5) |
| `Tappioasemassa puoliajalla` | how many matches it trailed at the break | settled (Q5) |
| `Käännetty voitoksi` | of those, won | settled (Q5) |
| `Tasoitettu` | of those, drawn | settled (Q5) |
| `{n} ottelua` / `1 ottelu` | a figure's value | settled (Q5) |
| `Ei vielä otteluita tappioasemasta.` | when the team never trailed at half-time | settled (Q5) |
| `Puoliaikatulos puuttuu {n} ottelusta.` | beneath the figures, when some of the season's matches have no half-time score (Q4) | settled (Q5) |
| `Puoliaikatuloksia ei ole tälle kaudelle.` | instead of the figures, when none of the season's matches has one | settled (Q5) |
| `Käännettyjä otteluita ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled (Q5) |

## API & Data

### What the providers give (measured 2026-09-20)

| | |
|---|---|
| **football-data.org** | `/matches` returns `score.halfTime` beside `score.fullTime`. Premier League 2024/25 matchday 1: every match had it |
| **football-data, older seasons** | **403 Forbidden** for PL 2022 and 2020 — the plan's season window, not the field. A backfill reaches only the seasons the API still serves |
| **TASO** | `hts_A` / `hts_B` beside `fs_A` / `fs_B`. Veikkausliiga 2025 **132/132**, 2019 **132/132**, 2015 **198/198**; **Ykkönen 2025 131/132** |

So coverage is good but not total, and the gap is **per match**. A season can be
almost complete and still have one match without a half-time score.

### Storage

- A nullable column on `matches` and on `taso_matches` for each side's
  half-time goals — `half_time_home` / `half_time_away`, beside football-data's
  existing `regular_time_*` and `extra_time_*` (Q3, left to the implementation).
- **A migration**, named per `CLAUDE.md` (`--name=add_half_time_goals`).
- **A backfill** for stored seasons, re-reading the providers where they still
  serve them. Existing rows keep `null` until then, which is exactly the "no
  half-time score" case the panel already has to handle.
- **`scripts/backfill-run.ts` has to change first, and production has to be
  backfilled again** (Q7). Today it skips any competition-season that already
  has rows (`alreadyStored` → "already stored, skipped"), so a plain re-run would
  skip everything and write no half-time value. It needs a way to re-fetch
  seasons that are already stored — a flag, so the ordinary first-run behaviour
  is unchanged — and `docs/setup/022-production-backfill.md` has to say when to
  use it.

### The figures

Over the team's finished league matches that **have** a half-time score:

- **Trailed at half-time**: its half-time goals were fewer than the other side's.
- Of those: **won** at full time, and **drew** at full time.

A match without a half-time score is counted in neither, and its absence is
stated (Q4).

**How it is checked.** Trailed = won + drew + lost-anyway, and the three add up;
every match counted is one the standings page counts. The tests check both
against `calculateStandings`, and end to end against the standings page.

**Caching:** none, as the other panels. No new read: the team page already has
the season's matches, and the half-time columns ride along on them.

## Edge Cases

- **A season with no half-time score at all** (an old football-data season, or
  before the backfill): the figures are replaced by
  `Puoliaikatuloksia ei ole tälle kaudelle.`
- **Some matches missing**: the figures count what is known, and a line beneath
  says how many are missing (Q4).
- **The team never trailed at half-time**: `Ei vielä otteluita tappioasemasta.`
- **Trailed and lost anyway**: counted in "trailed", in neither of the others.
- **Signed-out reader, pass-through tables, cup and national-team pages, data
  that cannot be read:** exactly as the other panels.

## Performance & Limits

- No new provider request **at render time** and no new database read: the
  columns travel with the matches already loaded.
- **The backfill is the cost**, and it is one-off: one provider request per
  stored season, bounded by the same refresh rules as any other sync.

## Security & Secrets

No new environment variables. No secrets.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees `Käännetyt ottelut` in
      `Analyysit`: how many matches the team trailed at half-time, and of those
      how many it won and drew
- [ ] Every figure counts only matches with a known half-time score, from the
      team's own side of the fixture
- [ ] Won + drew is never more than trailed, and every counted match is one the
      standings page counts, for at least one football-data and one TASO league
- [ ] A season with some half-time scores missing says how many, **and still
      shows the figures for the matches that have one**
- [ ] A season with none says so instead of showing zeroes
- [ ] The half-time score is stored for both providers, written by both sync
      paths, and the migration is named
- [ ] Stored seasons are backfilled where the provider still serves them; a
      season the provider refuses is left as "no half-time data", not as zeroes
- [ ] `scripts/backfill-run.ts` can re-fetch already-stored seasons, and
      `docs/setup/022-production-backfill.md` says when to run it that way
- [ ] Signed out: no figures in the HTML, still one prompt
- [ ] No provider request and no database read added at render time, asserted by
      tests
- [ ] The other panels are unchanged
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/comebacks.test.ts` (new): the three figures; matches without a
  half-time score excluded and counted as missing; the away side read correctly;
  trailed-and-lost counted once.
- Both providers' normalisation: the half-time score parsed, and absent where the
  provider omits it (TASO's `hts_A` can be `""`, as `fs_A` can).
- `tests/unit/db/migrations.test.ts` already guards the migration's name.
- Panel, section, service and page tests as the other panels'.
- `tests/integration/…`: the column round-trips through both sync paths.
- `tests/e2e/comebacks.spec.ts` (new): the figures against the standings page;
  signed out.

## Files To Update

- `specs/036-halftime-comebacks.md` (this file)
- `src/db/schema.ts` + a migration, `src/lib/football-data.ts`, `src/lib/taso.ts`,
  both standings services, `src/lib/comebacks.ts` (new), a panel,
  `analytics-section.tsx`, both team pages, the backfill script
- `decisions/036-halftime-comebacks.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-20.

| | Question | Answer |
|---|---|---|
| Q1 | What counts as a comeback | *"best comeback is from behind to a win, but also a draw can be mentioned"* — the three figures, with the win the headline |
| Q2 | Blown leads | Not in this feature; filed as #429 |
| Q3 | Column naming | *"technical, you decide"* — `half_time_home` / `half_time_away`, beside the existing `regular_time_*` |
| Q4 | Missing data | Say how many are missing, and **do not hide** the figures for the matches that have a half-time score |
| Q5 | Strings | As proposed |
| Q6 | Where in `Analyysit` | After `Putket` |
| Q7 | Backfill | Every stored season the provider still serves, and production is backfilled again — which needs `backfill-run.ts` to re-fetch already-stored seasons |

## Open Questions

None. Every question above is answered.
