# 058 — The next meeting of a rivalry, predicted

> **Status: Q1–Q9 answered in chat on 2026-10-01; two edge-case rules (Q10)
> proposed, awaiting confirmation. The strings may be fine-tuned during
> implementation.** Written for #480, release 3 in the
> predictions plan; split out of #355, whose page (specs/047, the
> head-to-head page `…/kohtaamiset/:a/:b`) shipped without a prediction
> because no model existed yet.

## Summary

The rivalry page shows two teams' history and current form. A reader there
wants one more thing: **who wins next time?** This finds the pair's next
stored meeting and shows what the models predict for it — the same models,
and the same figures, as that match's own `Ennuste` (specs/051, specs/053,
specs/055) — with a link to how good those models have been (specs/054).

## Scope

### In scope

- The pair's next stored meeting on the head-to-head page, and the models'
  prediction for it (S1–S4).
- A link to the models' track record (S8).

### Out of scope

- A hypothetical meeting with no fixture: a prediction needs a venue and a
  competition (S1).
- A cup tie's prediction — #516 (S2).
- Any new model or measure.
- The two TASO national-team routes, which no model covers (specs/047 S10,
  specs/051 S5).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Which meeting | **The pair's next stored meeting in the page's region, by kickoff, `SCHEDULED` or `TIMED`, whichever side is at home, however far ahead; nothing when none is stored** | Miikka, 2026-10-01 (Q1): "suggestions good". |
| S2 | Which competitions | **Only a meeting in a covered competition (specs/051 S5); a cup tie gets no prediction, and nothing is said** | Miikka, 2026-10-01 (Q2). Predictions for cups are #516, filed the same day. |
| S3 | Which models | **All of them, exactly as `Ennuste` shows them for that match — the same component, rows and lines** | Miikka, 2026-10-01 (Q3). The two pages can never disagree. |
| S4 | Where | **A new group first, `Seuraava kohtaaminen`: date, competition, `{koti} – {vieras}` linking to the match page, then the predictions** | Miikka, 2026-10-01 (Q4). |
| S5 | The group rule | **specs/047 S12 kept: headings whenever two or more groups have content** | Miikka, 2026-10-01 (Q5). |
| S6 | No upcoming meeting | **The group absent, no heading, no message** | Miikka, 2026-10-01 (Q6). As specs/047 S8. |
| S7 | Access | **Signed in only; signed out the page is as today** | Miikka, 2026-10-01 (Q7). specs/047 S14. |
| S8 | The track record | **`Kuinka hyvin ennusteet ovat osuneet?` linking to `/ennusteet` filtered to that competition** | Miikka, 2026-10-01 (Q8). specs/056. |
| S9 | Release dependency | **Ships with whichever models are live; Poisson's row appears with specs/055** | Miikka, 2026-10-01 (Q9). |

## UX / UI (Finnish strings)

On the head-to-head page (`…/kohtaamiset/:a/:b`), signed in, when the pair
has an upcoming meeting in a covered competition (S1, S2):

1. `Seuraava kohtaaminen` — group heading, first (S4)
   - `4.10.2026 klo 17.00 · Veikkausliiga` — the kickoff as the match page
     formats it, and the competition
   - `HJK – KuPS`, linking to the match page
   - The predictions table and lines exactly as that match's `Ennuste`
     (S3), its heading omitted (the group names it)
   - `Kuinka hyvin ennusteet ovat osuneet?` → `/ennusteet` for that
     competition (S8)
2. `Nykyinen vire`, `Keskinäinen historia` — specs/047's, unchanged

No new failure string: `Ennuste`'s own lines cover a failed read.

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The next meeting | The pair's stored matches in the page's region (specs/042 S2, S6), `SCHEDULED` or `TIMED`, kickoff after now, the earliest; ties by provider match id (S1) |
| Covered or not | specs/051's `baselineCompetition` for that match (S2) |
| The predictions | `Ennuste`'s own body for that stored match (S3) |
| Access | `canSeeAnalytics()` before the read (S7) |

## Edge Cases

| Case | Behaviour |
|---|---|
| No upcoming meeting stored | No group (S6) |
| The next meeting is a cup tie | No group (S2), even if a later league meeting exists — the next meeting is the one predicted (Q10) |
| The next meeting's kickoff has passed, status lagging | Not upcoming: the following one, if any (Q10) |
| A placeholder side | No page at all (specs/042 S8) |
| One model failing | `Ennuste`'s own failure line, the other rows kept |
| Only the history group would show | The page exactly as today (S5) |
| The two TASO national-team routes | No group (Scope) |
| Signed out | No group, the page as today (S7) |

## Performance & Limits

One indexed read for the pair's next meeting, then `Ennuste`'s reads.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, a head-to-head page whose pair has an upcoming meeting in a covered competition shows `Seuraava kohtaaminen` first: the date and time, the competition, the match linking to its page
- [ ] The group's predictions are exactly the match's `Ennuste` rows and lines
- [ ] It links to `/ennusteet` for that competition
- [ ] No upcoming meeting, a cup tie, a national-team route, or a signed-out reader: no group, and the page as today
- [ ] Group headings follow specs/047 S12 with the new group counted
- [ ] No provider request
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/…` | The next meeting: status, kickoff, ties, region; covered or not |
| `tests/unit/components/…` | The group first, its lines and link; `Ennuste`'s rows reused; absent cases; the heading rule |
| `tests/integration/…` | The next-meeting read against Postgres |
| `tests/e2e/…` | Signed in, a seeded upcoming meeting's group; signed out, absent |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/058-rivalry-prediction.md` (this file)
- The head-to-head page, and `Ennuste`'s body shared with it
- `decisions/058-rivalry-prediction.md`, by the implementing agent

## Open Questions

Q1–Q9 were answered in chat on 2026-10-01 and are recorded as S1–S9. #516
(predictions for cups) was filed from S2. Writing the rest raised one:

10. **Two rules that follow from S1 and S2**: when the next meeting is a cup
    tie there is no group, even if a league meeting comes after it — the
    next meeting is the one predicted, never a later one; and a meeting whose
    kickoff has passed but whose status still says scheduled is skipped for
    the following one (as specs/052 S5). *Proposal: as stated.*
