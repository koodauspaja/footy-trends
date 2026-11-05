# 076 — Arvauspeli: matches that do not go as listed

## Summary

Guesses on a Veikkausliiga match that is postponed, cancelled, abandoned,
awarded, or moved earlier are settled by rules of their own, so no player loses
tokens to a match that was not played as listed. Builds on specs/072, and is
released with it (#748).

## Scope

### In scope

- **Postponed**, meaning the stored kickoff moved later: a free change (S1, S5).
- **Abandoned**, with a result stored or not: a refund (S2, S9).
- **A match still without a result 48 hours after kickoff**, or with a status not
  seen before: its guesses stay open, and a `warn` names it (S7, S8, S10).
- **Awarded by decision**, TASO's `Forfeited`: score guesses pay as exact (S2,
  S4).
- **A kickoff moved earlier**: a guess made after the new kickoff is void and
  refunded (S3).
- The data both need: TASO's own status kept beside the normalized one, and the
  kickoff each guess was made against.

### Out of scope

- Everything specs/072 settles: prices, tiers, rewards, the page.
- **A match postponed with no new date (S6) and a cancelled match (S8).** Never
  seen for Veikkausliiga; built when a case is.
- Changing how tables, simulations or predictions treat `Forfeited`. They keep
  it as `FINISHED`.

## Settled decisions

All settled in chat for specs/072, 2026-11-04, and moved here with these numbers.

| # | Decision | Source |
|---|---|---|
| S1 | **A postponed match:** a guess on it can be changed with no extra cost | Miikka (072's Q8) |
| S2 | **Cancelled, or abandoned with no result:** everything paid on the guess is refunded, changes included. **Awarded by decision:** every score guess on it pays as an exact score, and a 1X2 guess pays as usual against the awarded result | Miikka (072's Q8) |
| S3 | **A kickoff moved earlier, so that a guess turns out to have been made after the real kickoff:** that guess is void, and what was paid for it is refunded. A guess made before the new kickoff stands | Miikka (072's Q17): "suggestions good" |
| S4 | **Awarded with no recorded score:** a 1X2 guess is settled by TASO's `winner`, and score guesses pay as exact. With no `winner` either, every guess is refunded | Miikka (072's Q18): "suggestions good" |
| S5 | **Postponed means the stored kickoff moved later**, whatever TASO's status says. A guess made before the move can be **changed once for free per postponement**, until the new kickoff, the floor's free guess included. A new guess on it is priced by the new kickoff | Miikka: "postponed means kickoff moved later, changing free once, match with no new date is open for guesses"; once per postponement (072's Q24): "suggestions good" |
| S6 | **A match postponed with no new date** stays open for guesses, priced at the earliest price, 10, until a date appears; then it locks at that kickoff. **Not built until a case is seen** (S7) | Miikka (072's Q25): "suggestions good" |
| S7 | **"No new date" is not built yet.** A match past its kickoff with no result stays locked and unsettled, and a `warn` names any Veikkausliiga match still without a result 48 hours after kickoff, so the first case is noticed | Miikka, 2026-11-04 (Q1): "veikkausliiga most likely never postpone or cancel … these are never-to-happen or almost-never-to-happen cases". TASO has never stored one, and a match past kickoff with no result can be our data running behind (Measured) |
| S8 | **Cancelled is not taken from a match dropping out of TASO's response**, since the refresh may not delete it. Its guesses stay open and S7's `warn` names it; a refund is decided when a case is seen | Miikka, 2026-11-04 (Q2), as S7 |
| S9 | **Abandoned with a result stored** is refunded all the same: a partial score is not a result | Miikka, 2026-11-04 (Q3): "your suggestions are good" |
| S10 | **A status not seen before**, such as `Break`, leaves its guesses open, and a `warn` names the match and the status | Miikka, 2026-11-04 (Q4): "your suggestions are good" |

## Measured

Production, read-only, 2026-11-04:

- **Every TASO status stored, any competition, 2015–2026:** `FINISHED` 20 783,
  `SCHEDULED` 33, `Abandoned` 1 (2026), `Break` 1 (2016, a match stored at
  half-time). Veikkausliiga has only ever had `FINISHED` and `SCHEDULED`.
  `Forfeited` is not visible: `normalizeStatus` stores it as `FINISHED`.
- **No cancelled status exists.** What TASO does with a cancelled match is not
  known: a status not yet seen, or the match dropped from its response.
- **A match past kickoff with no result is not always postponed.** Ykkösliiga's
  and Ykkönen's last round, 17 and 18 October 2026, is still stored as
  `SCHEDULED` with no score: our data is behind, not the match.

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (072's S20).

- **A postponed match:** "Ottelu siirtyi. Voit muuttaa arvaustasi kerran
  maksutta." and the change button reads "Muutos on maksuton".
- **In `Ratkaistut`:**
  - "Ottelu keskeytettiin, pelimerkit palautettu +{n}" (abandoned),
  - "Ottelua ei ratkaistu, pelimerkit palautettu +{n}" (S4's refund),
  - "Ottelu ratkaistiin päätöksellä +{n}" (awarded),
  - "Arvaus tehtiin ottelun alettua, pelimerkit palautettu +{n}" (S3).

## API & Data

- **TASO's own status** is stored beside the normalized one, so `Forfeited` is
  told apart from `Played`. Tables, simulations and predictions keep reading the
  normalized one.
- **Each guess stores the kickoff it was made against.** The refresh overwrites
  `kickoff_at`, so a later kickoff is a postponement (S5), and an earlier one
  that falls before the guess was made is S3.
- **Refund rows** join 072's ledger.
- **Settling**, in 072's step: abandoned matches are refunded,
  awarded ones paid by S2 and S4, guesses S3 catches voided. A postponement's
  free change is a change row of `0`.

## Edge Cases

| Case | Behaviour |
|---|---|
| A kickoff moved later, twice | Two free changes, one after each move (S5) |
| A kickoff moved later after the free change was used | A new free change |
| A kickoff moved earlier, the guess made before it | Stands; locks at the new kickoff |
| A kickoff moved earlier, the guess made after it | Void and refunded (S3) |
| Abandoned with a result stored | Refunded (S9) |
| Abandoned with no result | Refunded (S2) |
| No result 48 hours after kickoff | Open and locked; `warn` (S7) |
| Dropped from TASO's response | Open; S7's `warn` (S8) |
| Awarded with a score | Score guesses 100; 1X2 by the score |
| Awarded with no score, a `winner` | 1X2 by `winner`; score guesses 100 |
| Awarded with no score and no `winner` | Every guess refunded |
| A status not seen before | Open; `warn` (S10) |

## Performance & Limits

The same as 072: one query per match over its guesses.

## Security & Secrets

No new variables or secrets.

## Logging

- **Settling:** 072's run line also counts refunded and voided guesses.
- `warn`, once per match and run, for a Veikkausliiga match with guesses that
  is still without a result 48 hours after kickoff (S7), or has a status not
  seen before (S10): the match id, the status and the kickoff. Ids only.

## Acceptance Criteria

- [ ] A guess on a match whose stored kickoff moves later shows "Muutos on maksuton" and can be changed once for free; a second move gives one more free change
- [ ] A new guess on a postponed match is priced by its new kickoff
- [ ] The floor's free guess can use a postponement's free change
- [ ] A guess made before a kickoff that moved earlier stands; one made after it is void and refunded
- [ ] Guesses on an abandoned match are refunded, changes included, with a result stored or not
- [ ] An awarded (`Forfeited`) match with a score pays every score guess 100 and settles 1X2 guesses by the score
- [ ] An awarded match with no score settles 1X2 by TASO's `winner`, and with no `winner` refunds every guess
- [ ] Tables, simulations and predictions still count `Forfeited` as finished
- [ ] A match with guesses and no result 48 hours after kickoff stays unsettled and gets one `warn` per run; so does a status not seen before

## Tests Required

- `tests/unit/lib/guessing-game.test.ts`: every row of the edge table; S5's count
  of free changes across two moves; S3 on both sides of the new kickoff.
- `tests/unit/lib/taso.test.ts`: `Forfeited` stored with its own status and
  still `FINISHED` for tables; `Abandoned` and an unknown status kept verbatim.
- `tests/integration/guessing-game.test.ts`: settling an abandoned, an awarded
  and an awarded-with-no-score match against the database; refund rows sum to
  what was paid; a refresh that moves a kickoff later grants one free change,
  earlier voids a late guess; S7's and S10's `warn` lines, once per match and
  run.

## Files To Update

- `specs/076-guesses-on-irregular-matches.md`
- `src/lib/taso.ts`, `src/db/schema.ts` and the migrations `add_taso_provider_status` (TASO's own status) and `alter_game_guess_for_settlements` (each guess's kickoff, and one settlement per guess)
- `docs/infrastructure.md` if the settling line changes

## Open Questions

None.
