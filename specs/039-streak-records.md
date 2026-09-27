# 039 — Streak records across stored seasons

> **Status: all questions answered in chat on 2026-09-22, awaiting the go.**
> Written for #447.

## Summary

A panel in the team page's `Analyysit` section holding a club's **records**:
its longest runs of wins, of matches unbeaten, of defeats and of matches
without a win, across every stored season rather than inside one. Where
`Putket` (specs/035) says what the club is doing this season, this says the
best — and the worst — it has ever done.

It is the across-seasons counterpart to `Putket`, and the second half of what
#426 was split into. It is deliberately **not** a comparison: #448's panel asks
whether this season is normal, against a *typical* value; a record is compared
against nothing, because it *is* the extreme.

## Scope

### In scope

- One club, its records over every stored **league** season, in `Analyysit`.
- Both providers. Results only.
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- The four longest runs `Putket` already names, asked of a longer window.

### Out of scope

- Any per-season value, trend or average. #448's panel owns the comparison and
  `Putket` owns this season.
- A record book for a fixture or a competition rather than a club.
- Cup and national-team competitions (#425).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | When a run may cross a season | **Only between consecutive seasons of the same competition** | Miikka, 2026-09-22: a run crosses a season boundary but not a relegation. Stated as *consecutive* rather than merely *same competition* because a club that went Veikkausliiga → Ykkönen → Veikkausliiga would otherwise have its two Veikkausliiga runs joined as though the middle season never happened. |
| S2 | What that same rule also prevents | **A record invented out of a gap in stored data** | "Every stored season is not every season the club played" (#426). If a season was never fetched, the seasons either side sit adjacent *in storage* while a whole season is missing between them. Testing consecutive **years** rejects the relegation case and the missing-season case with one rule rather than two. |
| S3 | How a record is named | **By the season or seasons it spans**, not by match numbers | `Putket` prints `Ottelut 5–9`, which means something inside one season and nothing across three. A record book's job is to say *when*. |
| S4 | Which seasons count | League seasons of a competition the registry **knows**, as specs/038 S6 and its third review round | A cup has no league table and a competition the app cannot name is one whose format it is only guessing. The same rule, so the two panels cannot disagree about what a club's seasons are. |
| S5 | Which matches count | Exactly the league matches every other panel counts | `teamLeagueMatches` counts table groups only, which is why the playoff is excluded from `Putket` and `Kääntyneet ottelut`. A record built on matches the other panels exclude would not be the same club's record. |
| S6 | Cost | No provider request, no cache | Inherited from specs/038: `needsRefresh` returns `false` for any past season with stored rows, and the multi-season read built there is reused unchanged. |
| S7 | Two blocks with an equally long record | **The most recent wins** | It is the one a reader remembers, and the only one that can still be extended. |
| S8 | How a span is worded | **Always by season, never by match numbers** | A record spanning two seasons cannot use match numbers meaningfully — match 37 of a concatenated block is not something a reader can find — so naming matches would give the panel two formats depending on the record. `Putket` keeps `Ottelut 5–9` for this season: the two panels answer different questions, so a different unit for "when" is honest rather than inconsistent. |
| S9 | One season that cannot be read | **Fails the whole panel** | A record is not an average, and a missing season can only make a record too small rather than wrong in kind — but the panel beside it fails for the same reason, and one rule across both is worth more than a defensible difference. |

### Why S1 is one rule and not three

Relegation, promotion and a missing season are three ways for two stored seasons
to be non-adjacent. All three are caught by asking whether the seasons are the
same competition **and** consecutive years, so the implementation has one test
and the reader one rule. A club promoted mid-history keeps two separate records
— one per spell in each division — which is what a supporter means by "our best
run in Veikkausliiga".

## API & Data

**No new endpoint, no new column, no provider request.**

### What is reused rather than written

| Needed | Already there |
|---|---|
| The four longest runs from a match list | `streaksOf` (`src/lib/streaks.ts`), unchanged: it takes finished matches in kickoff order and returns `longest` per kind |
| Every stored league season's matches | The multi-season read built for specs/038, in both providers' services |
| Which seasons are league seasons of a known competition | `otherLeagueSeasons` and the two `isLeague` predicates from specs/038 |
| A season's label | The page's own: plain years domestically, `formatSeasonLabel` with `spansCalendarYears` abroad |

**The new work** is the grouping: stored league seasons sorted into blocks of
consecutive years within one competition, each block's matches concatenated in
kickoff order, `streaksOf` run per block, and the best of each kind taken across
blocks. That grouping is pure and is where the tests should bite.

**Caching:** none, as specs/038 S11.

## UX / UI (Finnish strings)

Agreed **for now** on 2026-09-22 — Miikka: *"strings ok at least for now"* — and
written by a non-native speaker, so the wording is the likeliest thing here to
change once the real page can be seen. Four of the figure labels are reused from
`Putket` verbatim and are not in question.

**Where:** `Analyysit`, after `Tämä kausi verrattuna` — the tenth panel.

| String | Where | Status |
|---|---|---|
| `Ennätykset` | panel subheading | settled for now (Q1) |
| `Pisin voittoputki`, `Pisin tappioton putki`, `Pisin tappioputki`, `Pisin voitoton putki` | the four figures, reused verbatim from `Putket` | settled, reused |
| `9 voittoa`, `4 ottelua ilman tappiota` … | a record's value, in the words `Putket` already uses | settled, reused |
| `Kausi {a}` / `Kaudet {a}–{b}` | when a record was set, e.g. `Kaudet 2024–2025` | settled for now (Q1, S8) |
| `Ei vielä ennätyksiä.` | a club with no finished league match at all | settled for now (Q1) |
| `Ennätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled for now (Q1) |

## Edge cases

Derived from the code and from the decisions above; none is left open.

| Case | Behaviour |
|---|---|
| The club has **one stored season** | The records are that season's, named by it. No special case: a block of one is a block. |
| The club has **no finished league match** | The panel says so rather than showing four empty figures. |
| Two blocks hold an **equally long** record | The most recent is reported (S7). |
| A season is **in progress** | It counts. A record being set now is still the record, and its span names the current season. |
| A club **changed competition** between two stored seasons | Two blocks; the record is the best of the two, named by its own block's seasons. |
| A stored season is **missing** between two others | Not adjacent by year, so not joined (S2). |
| A season has **no league match** (knockout groups only) | Left out, as specs/038's third round settled. It cannot join two blocks either. |
| A kind has **no run at all** — a club that never lost | That figure says so, as `Putket` already does with `Ei vielä putkea.` |
| A season read **fails** | The panel's own error line: one unreadable season fails the panel (S9). |

## Performance & limits

No provider request. The same reads specs/038 made — up to about twelve for a
Finnish club, four for a foreign one — and the selected season's is already warm
from the other panels. If both panels are on the page, they read the same
seasons; whether that is one read or two is an implementation detail, and
`cache()` already makes it one.

## Security & secrets

No new environment variable and no new secret. Behind `canSeeAnalytics()` like
every other panel; a signed-out request must compute no value.

## Acceptance criteria

- [ ] A run continues across a season boundary **only** between consecutive
      seasons of the same competition
- [ ] A relegation, a promotion and a missing stored season each break a run,
      verified separately
- [ ] Each record is named by the season or seasons it spans, in the same
      season wording the page's own selector uses for that provider
- [ ] Records are computed from exactly the league matches the other panels
      count — a playoff or knockout match is in none of them
- [ ] A club with one stored season still gets its records
- [ ] A signed-out reader sees the existing single prompt and the page carries
      no computed value
- [ ] No provider request is made for a past season
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Where two spells hold an equally long record, the most recent is the one shown
- [ ] A season that cannot be read fails the panel rather than shrinking a record

## Tests required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/streak-records.test.ts` | Blocks of consecutive same-competition seasons; a relegation, a promotion and a missing year each split a block; the best across blocks; a one-season club; ties (Q2) |
| `tests/unit/components/streak-records-section.test.tsx` | Each figure rendered with its span; the no-records line; nothing signed out |
| `tests/unit/lib/standings-service.test.ts`, `tests/unit/lib/taso-standings-service.test.ts` | Both providers: knockout seasons excluded; an unknown competition excluded |
| `tests/e2e/streak-records.spec.ts` | Signed in, the records appear and agree with `Putket` for a club with one stored season; signed out, no value in the HTML |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files to update

- `specs/039-streak-records.md` (this file)
- `src/lib/` — the season grouping and the record shape
- `src/components/` — the panel, and its wiring into `analytics-section.tsx`
- Both providers' services, for the records read
- Tests as listed above
- `decisions/039-streak-records.md`, written by the implementing agent

## Open questions

**None blocking.** Q1–Q4 were answered in chat on 2026-09-22 and are recorded as
S7–S9 and in the UX table.

Two things deliberately left outside this spec:

- **This makes ten `Analyysit` panels.** #424 was filed when there were five and
  still says so. Whether its grouping lands before or after this feature is a
  release-ordering question rather than a spec one, but it should be decided
  rather than discovered.
- **`Putket` will sit beside a record book** showing four similarly-named
  figures. If they read as duplication on screen, whether `Putket` should keep
  its own longest figures is worth its own issue — changing it is out of scope
  here.
