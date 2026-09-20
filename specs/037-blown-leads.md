# 037 — Blown leads: led at half-time, did not win

> **Status: agreed on 2026-09-21 and implemented in PR #435.**

## Summary

The mirror of specs/036: how often a team **led at half-time and failed to
win**. #036 counts the deficits a team rescued; this counts the leads it gave
away, and the two together are the same question asked in both directions —
what became of a match after the break.

**It needs no new data.** The half-time score landed with #335 (migration
`0017_add_half_time_goals`), on both match tables and both sync paths. The same
column answers both measures, which is why this was kept out of #335 rather
than filed as a nice-to-have.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit`, following the page's
  season selector.
- Both providers, football-data.org and TASO.
- **League format only**, as the other panels (#425 revisits that rule).
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- **Merging the two directions into one panel** (Q1), which renames the
  existing `Käännetyt ottelut` to `Kääntyneet ottelut` (Q2).

### Out of scope

- **New data of any kind.** No column, no migration, no backfill, no provider
  change.
- **Matches level at half-time.** They are counted in neither direction, and
  the panel says nothing about them (see *Edge Cases*).
- **"Led and won" and "trailed and lost"** as figures of their own. #036
  deliberately shows the deficit total and the two outcomes that changed it,
  leaving the third implied; this mirrors that rather than adding a sixth and
  seventh row.
- Goal times and "who scored first": neither provider gives events here.

## UX / UI (Finnish strings)

**Where:** the existing comebacks panel in `Analyysit`, which this extends
rather than adds to. Its position after `Putket` is unchanged.

**The panel is renamed.** `Käännetyt ottelut` ("matches turned around") is
about what the team did to a deficit, and cannot cover a lead it lost.
`Kääntyneet ottelut` ("matches that turned") covers both, and is Miikka's
wording, 2026-09-21.

| String | Where | Status |
|---|---|---|
| `Kääntyneet ottelut` | panel subheading, replacing `Käännetyt ottelut` | settled (Q2) |
| `Tappioasemassa puoliajalla` | matches trailed at the break | unchanged from specs/036 |
| `Käännetty voitoksi` | of those, won | unchanged from specs/036 |
| `Tasoitettu` | of those, drawn | unchanged from specs/036 |
| `Johdossa puoliajalla` | matches led at the break | settled (Q3) |
| `Valunut tasapeliksi` | of those, drawn | settled (Q3) |
| `Käännetty tappioksi` | of those, lost | settled (Q3) |
| `{n} ottelua` / `1 ottelu` | a figure's value | unchanged from specs/036 |
| `Ei vielä otteluita tappioasemasta.` | when the team never trailed at the break | unchanged from specs/036 |
| `Ei vielä otteluita johtoasemasta.` | when the team never led at the break | settled (Q5) |
| `Puoliaikatulos puuttuu {n} ottelusta.` | once, beneath both directions | unchanged from specs/036 |
| `Puoliaikatuloksia ei ole tälle kaudelle.` | instead of everything, when no match has a half-time score | unchanged from specs/036 |
| `Kääntyneitä otteluita ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled (Q6), replacing `Käännettyjä otteluita ei voitu laskea.` |

### Layout

Two groups of three, the trailing trio first — it is the one already on the
page, so a returning reader finds it where they left it. Side by side from
`sm:` up, as the panel's `<dl>` already does; stacked on a phone, each group
led by its own total so the three rows beneath it are unambiguous.

**One missing-data line for the panel**, not one per direction. Both
directions count out of the same matches, so two identical lines saying the
same number would read as two separate gaps (Q1).

## API & Data

### The figures

Over the team's finished league matches that **have** a half-time score:

- **Led at half-time**: its half-time goals were more than the other side's.
- Of those: **drew** at full time, and **lost** at full time.

Alongside the three specs/036 already defines for the mirror case. A match
without a half-time score is counted in neither direction and in neither
total, and its absence is stated once.

**How it is checked.** `drew + lost ≤ led`, `won + drew ≤ trailed`, and
`trailed + led ≤ known` — the third because a match cannot be both, and is
strict rather than equal exactly when a match was level at the break. Every
match counted is one the standings page counts. Checked against
`calculateStandings` in the unit tests and against the standings page end to
end, as specs/036 is.

**Caching:** none, as the other panels.

### Reads and requests

**No new read and no new provider request.** The half-time columns already
travel with the season's matches the team page loads, and the existing
`getTeamComebacks` on both services already returns them. This adds arithmetic
to a function that has already been called, not a call.

## Edge Cases

- **Level at half-time**: counted in `known`, in neither direction. A season of
  nothing but goalless first halves shows both "not yet" messages, which is
  correct — it has neither rescued a deficit nor lost a lead.
- **Led and won**: counted in `led`, in neither of the two outcome rows — the
  mirror of specs/036's "trailed and lost".
- **Never led, but trailed**: the leading group is replaced by
  `Ei vielä otteluita johtoasemasta.`, the trailing group still shows its
  figures (Q4). And the reverse.
- **Neither**: both messages, and the missing-data line if any match lacks a
  half-time score.
- **No half-time score at all for the season**:
  `Puoliaikatuloksia ei ole tälle kaudelle.` replaces the whole panel body,
  unchanged from specs/036.
- **Signed-out reader, pass-through tables, cup and national-team pages, data
  that cannot be read:** exactly as the other panels.

## Performance & Limits

No new provider request and no new database read, at render time or otherwise.
The season's matches are already loaded and already carry the columns. Nothing
about this feature is bounded by a provider quota.

## Security & Secrets

No new environment variables. No secrets. No change to the analytics gate.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees, in one panel
      `Kääntyneet ottelut`, both directions: matches trailed at half-time with
      how many were won and drawn, and matches led at half-time with how many
      were drawn and lost
- [ ] Every figure counts only matches with a known half-time score, from the
      team's own side of the fixture
- [ ] `drew + lost ≤ led`, `won + drew ≤ trailed`, and `trailed + led ≤ known`,
      for at least one football-data and one TASO league
- [ ] A match level at half-time is counted in neither direction
- [ ] A season with some half-time scores missing says how many **once**, and
      still shows the figures for the matches that have one
- [ ] A season with none says so instead of showing zeroes, as before
- [ ] A team that never led sees `Ei vielä otteluita johtoasemasta.` in place of
      three zeroes, and still sees the trailing figures — and the reverse
- [ ] The panel is renamed to `Kääntyneet ottelut` everywhere it appears,
      including the e2e assertions on panel order and the strings specs/036
      records
- [ ] Signed out: no figures in the HTML, still one prompt
- [ ] No provider request and no database read added, asserted by tests
- [ ] The other panels are unchanged, and the panel count stays at eight
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/comebacks.test.ts` (extended): the three new figures; a match
  level at half-time counted in neither direction; led-and-won counted once;
  the away side read correctly; `trailed + led ≤ known`.
- `tests/unit/components/comebacks-section.test.tsx` (extended): both groups;
  each "not yet" message independently; one missing-data line, not two; the
  season-wide message still replacing everything.
- Both services' tests (extended): the new figures against `calculateStandings`,
  and TASO's league-only rule still excluding a match-list group.
- `tests/e2e/comebacks.spec.ts` (extended): both directions against the seeded
  2017 season. **No fixture change is needed** — its existing half-time scores
  already produce every case, measured 2026-09-21 over its six league matches:

  | Team | Trailed | won | drew | Led | drew | lost | Missing | Known |
  |---|---|---|---|---|---|---|---|---|
  | Fixture HJK | 1 | 1 | 0 | 1 | 0 | 0 | 1 | 2 |
  | Fixture KuPS | 2 | 1 | 1 | 1 | 0 | **1** | 0 | 3 |
  | Fixture Ilves | 1 | 0 | 0 | **2** | **2** | 0 | 0 | 3 |
  | Fixture Inter | 1 | 0 | 1 | 1 | 0 | **1** | 1 | 2 |

  So: KuPS and Inter each give a lead lost outright, Ilves gives two leads
  surrendered to draws, HJK gives a lead counted in the total with neither
  outcome row (it led and won), and Ilves gives the mirror of that for a
  deficit (it trailed and lost). HJK and Inter each carry a missing match.
- The e2e specs asserting panel order (`form-trend`, `goals-trend`, `streaks`)
  updated for the rename, deliberately rather than deleted.

## Files To Update

- `specs/037-blown-leads.md` (this file)
- `specs/036-halftime-comebacks.md` — its strings table records
  `Käännetyt ottelut`, which this renames; the note belongs there rather than
  leaving the older spec contradicting the page
- `src/lib/comebacks.ts`, `src/components/comebacks-section.tsx`, both standings
  services' `getTeamComebacks`
- `decisions/037-blown-leads.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-21.

| | Question | Answer |
|---|---|---|
| Q1 | One panel or two | **One panel covering both.** Same half-time column, same denominator, and two identical missing-data lines would read as two separate gaps. Also keeps `Analyysit` at eight panels, which matters given #424. |
| Q2 | The merged panel's name | `Kääntyneet ottelut` — Miikka's own wording, replacing the proposals offered. The intransitive form covers a match that turned either way, where `Käännetyt` only covers one the team turned around. |
| Q3 | Finnish labels | The mirrored set: `Johdossa puoliajalla`, `Valunut tasapeliksi`, `Käännetty tappioksi` — chosen so the panel reads as the exact opposite of the trio already there. |
| Q4 | Empty state | A message per direction, not zeroes. One side can be empty while the other is not, and specs/036 already settled that zeroes read as a claim the data does not support. |
| Q5 | The "never led" message | `Ei vielä otteluita johtoasemasta.`, the mirror of the existing `Ei vielä otteluita tappioasemasta.` |
| Q6 | The error message | Renamed with the panel: `Kääntyneitä otteluita ei voitu laskea. Yritä myöhemmin uudelleen.` |
| Q7 | Renaming a panel that just shipped | Approved. Miikka, 2026-09-21: *"changes to previous is ok"* — asked because `Käännetyt ottelut` reached `main` in #432 the same day, and the rename touches specs/036, the panel and three e2e specs. |

## Open Questions

None. Every question above is answered.
