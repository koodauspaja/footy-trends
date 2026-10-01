# 057 — Surprise index: the biggest upsets, by what Elo expected

> **Status: Q1–Q10 answered in chat on 2026-10-01; the remaining strings and
> two edge-case rules (Q11, Q12) proposed, awaiting confirmation.** Written for #354, release 3 in
> the predictions plan. It reads what Elo predicted before each match
> (specs/053, logged by specs/052) and sets it against what happened.

## Summary

Every football fan remembers the upsets. Elo said before each match how likely
each outcome was; a result Elo gave 8 % is a bigger shock than one it gave
40 %. This ranks a season's matches by how unlikely their result was, so a
reader sees the biggest surprises of a competition's season — and, on a
finished match, how surprising that one was.

## Scope

### In scope

- A surprise figure for every finished match Elo predicted (S1, S2).
- The biggest surprises of a competition's season (S3–S6).
- The figure on a finished match's page (S7).

### Out of scope

- Any model but Elo, as #354 names it (S2).
- Cups and national teams, which Elo does not rate (specs/053 S5).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | The measure | **The probability Elo gave to what happened, shown as a percentage; the smaller, the bigger the surprise** | Miikka, 2026-10-01 (Q1): "all good suggestions". |
| S2 | Which prediction | **The `elo-v1` backtest row** | Miikka, 2026-10-01 (Q2). It exists for every match and knows only what came before kickoff. |
| S3 | Where | **The competition's standings page, a panel `Kauden suurimmat yllätykset` for the selected season** | Miikka, 2026-10-01 (Q3). |
| S4 | Which group | **A new group, `Tämä kausi`, first in `Analyysit`** | Miikka, 2026-10-01 (Q4). A season's matches are a question neither existing group asks (#424's rule). |
| S5 | How many | **The 10 most surprising: date, match and score, Elo's probability; each linking to its match** | Miikka, 2026-10-01 (Q5). |
| S6 | Draws | **Every outcome counts the same** | Miikka, 2026-10-01 (Q6). |
| S7 | The match page | **On a finished match Elo predicted: `Elo antoi tälle tulokselle 8 %.` under the score; nothing otherwise** | Miikka, 2026-10-01 (Q7). |
| S8 | The season in progress | **Included, marked `(kesken)`** | Miikka, 2026-10-01 (Q8). As specs/048. |
| S9 | Elo's run-in | **No list for a competition's first stored season, and a line saying why** | Miikka, 2026-10-01 (Q9). specs/053 S7. |
| S10 | Access | **Signed in only** | Miikka, 2026-10-01 (Q10). |

## UX / UI (Finnish strings)

**Competition standings page, `Analyysit`** (S3, S4), signed in:

1. `Tämä kausi` — new group, first
2. `Kauden suurimmat yllätykset` — panel heading
   - A numbered list, most surprising first, ten at most (S5):
     `21.4.2025 · Ilves – HJK 3–0 · Elo antoi 6 %` — the date, the match
     linking to its page, the score, and Elo's probability for that result
   - Under the list: `Yllätys on sitä suurempi, mitä pienemmän todennäköisyyden Elo antoi toteutuneelle tulokselle ennen ottelua.`
   - The season in progress: the heading's season labelled `(kesken)` as
     specs/048 does (S8)

**Match page** (S7), under the score of a finished match Elo predicted:
`Elo antoi tälle tulokselle 8 %.`

| String | When |
|---|---|
| `Elo-ennusteita ei ole kilpailun ensimmäiseltä tallennetulta kaudelta: kaikki joukkueet aloittavat silloin samasta luvusta.` | The competition's first stored season (S9) |
| `Kaudelta ei ole vielä pelattuja otteluita.` | No judged match in the season (Q12) |
| `Yllätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.` | The read failed |

**Proposed, pending Q11:** the strings above.

## API & Data

**No new table, no provider request, no new rating computation.**

| Needed | Where |
|---|---|
| Elo's prediction for each match | `predictions`, `model = elo-v1`, `kind = backtest` (S2) |
| The result | The match's stored score, finished with both scores, the shoot-out subtracted (specs/049 S3) |
| The surprise | The prediction's probability for the outcome that happened (S1) |
| A competition-season's list | Its judged matches, ten with the smallest probability; ties the earlier kickoff first (Q12) |
| A match's figure | Its own row; none if Elo has no row for it (S7) |
| The first stored season | The competition's earliest season with a stored finished match (S9) |
| Access | `canSeeAnalytics()` before anything is read (S10) |

**Caching:** none, as specs/049 — one indexed join for one competition-season.

## Edge Cases

| Case | Behaviour |
|---|---|
| A competition's first stored season | No list; the S9 line |
| A season with no judged match yet | The no-matches line (Q12) |
| A season with fewer than ten judged matches | All of them, still most surprising first |
| Two matches equally surprising | The earlier kickoff first (Q12) |
| A match Elo has no row for (a placeholder side, before the backtest ran) | Not in the list; no line on its page |
| A shoot-out | A draw (specs/049 S3) |
| A cup or national-team match | Never listed, no line (Scope) |
| Signed out | No figure in the HTML (S10) |

## Performance & Limits

One indexed read of a competition-season's judged matches.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, a covered competition's standings page shows `Tämä kausi` first in `Analyysit`, holding `Kauden suurimmat yllätykset`
- [ ] The list is the selected season's ten judged matches with the smallest probability Elo's backtest gave their result, ties the earlier first; each shows date, match (linked) and score, and the probability
- [ ] A shoot-out counts as a draw; a match without an Elo row is not listed
- [ ] The season in progress is included and marked `(kesken)`
- [ ] A competition's first stored season shows the run-in line instead of a list
- [ ] A finished match Elo predicted shows `Elo antoi tälle tulokselle N %.` under its score; others show nothing
- [ ] A failed read shows the failure line; signed out, no figure is in the HTML
- [ ] No provider request
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/surprise.test.ts` | The probability of the outcome that happened, each outcome; ranking, the ten, ties; the first-season rule |
| `tests/unit/lib/…service….test.ts` | The read for one competition-season; failure as its own case |
| `tests/unit/components/…` | The group first, the list and its links, the explanation, every Finnish line; the match page's line; signed out |
| `tests/integration/…` | The join against Postgres: a shoot-out a draw; backtest rows only |
| `tests/e2e/…` | Signed in, a real competition's list; a finished match's line |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/057-surprise-index.md` (this file)
- A pure module, its service, and the competition page and the match page
  (S7)
- `decisions/057-surprise-index.md`, by the implementing agent

## Open Questions

Q1–Q10 were answered in chat on 2026-10-01 and are recorded as S1–S10.
Writing the rest raised two:

11. **The strings** in UX / UI: the list's line, the explanation, the run-in,
    no-matches and failure lines. *Proposal: as drafted.*
12. **Two rules**: a season with no judged match shows
    `Kaudelta ei ole vielä pelattuja otteluita.`; equally surprising matches
    list the earlier kickoff first. *Proposal: as stated.*
