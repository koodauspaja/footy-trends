# 058 — The next meeting of a rivalry, predicted

> **Status: all questions answered in chat; the strings may be fine-tuned
> during implementation.** Q1–Q10 were answered on 2026-10-01 (S1–S10). The
> spec was then read against `main` on 2026-10-12, after specs/054 to 057 were
> built, and six more were answered that day (S11–S16). Written for #480;
> split out of #355, whose page (specs/047, the head-to-head page
> `…/kohtaamiset/:a/:b`) shipped without a prediction because no model existed
> yet.

## Summary

The rivalry page shows two teams' history and current form. A reader there
wants one more thing: **who wins next time?** This finds the pair's next
stored meeting and shows what the models predict for it — the same models,
and the same figures, as that match's own `Ennuste` (specs/051, specs/053,
specs/055) — with a link to how good those models have been in that
competition (specs/056).

## Scope

### In scope

- The pair's next stored meeting on the head-to-head page, and the models'
  prediction for it (S1–S4).
- `Ennuste`'s link to the models' track record, filtered to the match's
  competition, on the match page as on this one (S13).
- One line in `Ennuste` saying the prediction moves as matches are played, on
  the match page as on this one (S14).

### Out of scope

- A hypothetical meeting with no fixture: a prediction needs a venue and a
  competition (S1).
- A prediction in a competition the models do not cover: the domestic cups
  are #516 (S2).
- Any new model or measure, and any cap on how far ahead the meeting is (S14).
- The national-team routes, which no model covers: the two TASO ones
  (specs/047 S10) and football-data's `/maajoukkueet`, whose competitions are
  not covered (specs/051 S5).
- A page for a pair that has an upcoming meeting and no finished one (S15).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Which meeting | **The pair's next stored meeting in the page's region, by kickoff, `SCHEDULED` or `TIMED`, whichever side is at home, however far ahead; nothing when none is stored** | Miikka, 2026-10-01 (Q1): "suggestions good". |
| S2 | Which competitions | **Only a meeting in a covered competition (specs/051 S5); any other gets no prediction, and nothing is said** | Miikka, 2026-10-01 (Q2). Predictions for the domestic cups are #516, filed the same day. The Champions League is covered, so a Champions League meeting is predicted. |
| S3 | Which models | **All of them, exactly as `Ennuste` shows them for that match — the same component, rows and lines** | Miikka, 2026-10-01 (Q3). The two pages can never disagree. |
| S4 | Where | **A new group first, `Seuraava kohtaaminen`: date, competition, `{koti} – {vieras}` linking to the match page, then the predictions** | Miikka, 2026-10-01 (Q4). |
| S5 | The group rule | **specs/047 S12 kept: headings whenever two or more groups have content** | Miikka, 2026-10-01 (Q5). |
| S6 | No upcoming meeting | **The group absent, no heading, no message** | Miikka, 2026-10-01 (Q6). As specs/047 S8. |
| S7 | Access | **Signed in only; signed out the page is as today** | Miikka, 2026-10-01 (Q7). specs/047 S14. |
| S8 | The track record | **`Kuinka hyvin ennusteet ovat osuneet?` linking to `/ennusteet` filtered to that competition** | Miikka, 2026-10-01 (Q8). specs/056. Which link carries it is S13. |
| S9 | Release dependency | **Ships with whichever models are live** | Miikka, 2026-10-01 (Q9). All three are on `main` since specs/055. |
| S10 | Two rules from S1 and S2 | **A meeting in a competition that is not covered, as the next meeting, means no group, even with a later covered meeting; a passed kickoff whose status lags is skipped for the following meeting** | Miikka, 2026-10-01 (S10): "ok". Until #516, when the domestic cups are predicted. |
| S11 | Caching | **None on the next-meeting read** | Miikka, 2026-10-12: "if cache brings too little value, then no cache". Measured on production that day: the read runs in 0,1 ms, on the index the page's history read already uses; the whole cost is the round trip, which a cache would only move to Redis. |
| S12 | The next-meeting read fails | **The group absent, the rest of the page as today, one `error` line with the two team ids** | Miikka, 2026-10-12: "logging as suggested". |
| S13 | Which link carries S8 | **`Ennuste`'s own link, filtered to the match's competition on both pages** | Miikka, 2026-10-12: "your pick is good". `Ennuste` has ended with this link, unfiltered, since specs/054; a second one with the same words would have had another target. One link, so S3 still holds. |
| S14 | A meeting far ahead | **No cap. `Ennuste` gains one line, on both pages: `Ennuste perustuu tähän mennessä pelattuihin otteluihin ja muuttuu, kun uusia pelataan.`** | Miikka, 2026-10-12: "that's good". On production a foreign pair's next meeting was a median 70 days ahead, 409 of 1 360 over 120 days, at most 230. The match page already predicts such a match, so a cap here would hide what the linked page shows. The line is true of every prediction, so it has no threshold. |
| S15 | An upcoming meeting, no finished one | **No page, as today** | Miikka, 2026-10-12: "as suggested". The page needs a history (specs/042); 310 such pairs on production. |
| S16 | The models, with the evidence in | **All three stay** | Miikka, 2026-10-12: "yes, keep them". Nothing here picks a winner. |

## UX / UI (Finnish strings)

On the head-to-head page (`…/kohtaamiset/:a/:b`), signed in, when the pair
has an upcoming meeting in a covered competition (S1, S2):

1. `Seuraava kohtaaminen` — group heading, first (S4)
   - `04.10.2026 klo 17.00 · Veikkausliiga` — the kickoff as the match page
     formats it, and the competition
   - `HJK – KuPS`, linking to the match page
   - The predictions table and lines exactly as that match's `Ennuste`
     (S3), its heading omitted (the group names it)
2. `Nykyinen vire`, `Keskinäinen historia` — specs/047's, unchanged

In `Ennuste`, on the match page and here alike:

- `Ennuste perustuu tähän mennessä pelattuihin otteluihin ja muuttuu, kun uusia pelataan.`
  — under the models' lines, above the rounding note (S14)
- `Kuinka hyvin ennusteet ovat osuneet?` → `/ennusteet` for the match's
  competition, `Jälkikäteen lasketut` (S13)

No new failure string: `Ennuste`'s own lines cover a model's failed read, and
a failed next-meeting read shows nothing (S12).

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The next meeting | The pair's stored matches in the page's region (specs/042 S2, S6), `SCHEDULED` or `TIMED`, kickoff after now, the earliest; ties by provider match id (S1) |
| Covered or not | specs/051's `baselineCompetition` for that match (S2) |
| The predictions | `Ennuste`'s own body for that stored match (S3) |
| Access | `canSeeAnalytics()` before the read (S7) |

**Caching:** none on the next-meeting read (S11). `Ennuste`'s reads keep
their own: the Elo ratings and the Poisson fit, 15 minutes each (specs/053,
specs/055).

## Edge Cases

| Case | Behaviour |
|---|---|
| No upcoming meeting stored | No group (S6) |
| The next meeting is in a competition that is not covered | No group (S2), even if a later covered meeting exists — the next meeting is the one predicted (S10) |
| The next meeting is a Champions League match | The group: the Champions League is covered (S2) |
| The next meeting's kickoff has passed, status lagging | Not upcoming: the following one, if any (S10) |
| The next meeting is months ahead | The group, as any other (S14) |
| The next-meeting read fails | No group, the rest of the page as today, and a line in the log (S12) |
| The pair has an upcoming meeting and no finished one | No page, as today (S15) |
| A placeholder side | No page at all (specs/042 S8) |
| One model failing | `Ennuste`'s own failure line, the other rows kept |
| The next meeting, and a rivalry specs/047 S8 hides | `Seuraava kohtaaminen` and `Keskinäinen historia`, both headed (S5) |
| Only the history group would show | The page exactly as today (S5) |
| The two TASO national-team routes | No group, and no read (Scope) |
| football-data's `/maajoukkueet` | No group: its competitions are not covered (Scope) |
| Signed out | No group, no read, the page as today (S7) |

## Performance & Limits

One indexed read for the pair's next meeting, then `Ennuste`'s reads.
Measured on production on 2026-10-12: 0,08 ms for a Premier League pair and
0,10 ms for a Veikkausliiga pair.

## Security & Secrets

No new environment variable or secret.

## Logging

| Event | Level | The line |
|---|---|---|
| The next-meeting read fails | `error` | `Unable to read the pair's next meeting`, with the error and the two provider team ids (S12) |

Nothing else is new: the feature only reads, and the models' failed reads are
logged by the code that makes them (specs/051, specs/053, specs/055). No
personal data: the ids are teams'.

## Acceptance Criteria

- [ ] Signed in, a head-to-head page whose pair has an upcoming meeting in a covered competition shows `Seuraava kohtaaminen` first: the kickoff as the match page formats it, the competition, the match linking to its page
- [ ] The group's predictions are the match's `Ennuste` rows and lines, drawn by the same component
- [ ] The track-record link opens `/ennusteet` filtered to the match's competition, on the rivalry page and in the match page's `Ennuste` alike
- [ ] `Ennuste` carries the line `Ennuste perustuu tähän mennessä pelattuihin otteluihin ja muuttuu, kun uusia pelataan.` on both pages
- [ ] No upcoming meeting, a next meeting in a competition the models do not cover, any of the three national-team routes, or a signed-out reader: no group, and the page as today
- [ ] A failed next-meeting read: no group, the rest of the page as today, and one `error` line in the log carrying the two team ids
- [ ] A pair with an upcoming meeting but no finished one has no page, as today
- [ ] Group headings follow specs/047 S12 with the new group counted
- [ ] No provider request, and no cache on the next-meeting read
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/…` | The next-meeting read's failure: logged with both ids, and reported as an error |
| `tests/unit/components/…` | The group first, its lines and link; `Ennuste`'s rows reused; absent cases; the heading rule; `Ennuste`'s filtered link and its new line |
| `tests/integration/…` | The next-meeting read against Postgres: status, kickoff, ties, region |
| `tests/e2e/…` | Signed in, a seeded upcoming meeting's group; signed out, absent |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/058-rivalry-prediction.md` (this file)
- The head-to-head page, and `Ennuste`'s body shared with it
- `decisions/058-rivalry-prediction.md`, by the implementing agent

## Open Questions

**None.** Q1–Q10 were answered in chat on 2026-10-01 and are recorded as
S1–S10; the six raised on 2026-10-12 are S11–S16. #516 (predictions for the
domestic cups) was filed from S2.
