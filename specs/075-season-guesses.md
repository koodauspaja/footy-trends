# 075 — Arvauspeli: season guesses

## Summary

Before a Veikkausliiga season's first kickoff, a player of `Arvauspeli` can
guess the season as a whole: the champion, the six teams of `Mestaruussarja`,
the team that finishes last, and the whole final table. Each guess is paid for
once from the balance, can be changed for free until the lock, and is settled
when the season has answered it. Builds on specs/072, 076 and 073 (#748).

## Scope

### In scope

- **Four kinds of season guess** (S1) at fixed prices and rewards (S2).
- **Placing and changing** them before the lock, the season's first kickoff
  (S3).
- **Settling** each by the hourly run once its answer is final, from the table
  the standings page shows (S4).
- **The players' shares** of the champion and last-place picks after the lock
  (S6).
- **A section on `/arvauspeli`** (S7).

### Out of scope

- The season simulation (specs/061) as a model to play against (S5).
- A rarity bonus on season guesses (S10).
- The relegation play-off, and so 11th place as a relegation (072 S10).
- Season guesses after the first kickoff, for a late joiner or anyone (S8).
- Anything 072 settles about single matches.
- Any competition but Veikkausliiga.

## Settled decisions

All from Miikka, 2026-11-05: "all suggestions are good", on the questions as
suggested (S1–S11); and on the open questions, "3. we can change rules if the
format changes / otherwise, good" (S12–S16).

| # | Decision |
|---|---|
| S1 | **Four kinds:** `Mestari`, one team; `Mestaruussarjan joukkueet`, six teams; `Putoaja`, the team in 12th place; `Lopullinen sarjataulukko`, all 12 places. One guess of each kind per player per season |
| S2 | **Fixed prices, paid once:** `Mestari` 50, pays 200 if right; `Mestaruussarjan joukkueet` 50, pays 15 for each team right, up to 90; `Putoaja` 50, pays 200 if right; `Lopullinen sarjataulukko` 100, pays 30 for each team in its exact place and 10 for each team one place off. Sized so an informed guess earns back about what a match guess does, around 1.35× |
| S3 | **All four lock at the season's first stored kickoff.** Until then a guess can be changed for free: the price never changes, so paying again would only punish rethinking. Unlike 072 S4 |
| S4 | **Settled by the hourly run as soon as the answer is final:** `Mestaruussarjan joukkueet` after the regular season's last match, the other three after both groups' last matches. Judged by our own table, the one the standings page shows. A final place is a team's place in `Mestaruussarja` (1–6), or 6 + its place in `Karsintasarja` (7–12) |
| S5 | **The simulation does not play as a model in 075.** Before the first kickoff it can guess only the six (specs/061 S5, specs/064 S4), not a champion, a last place or a table. A follow-up issue if wanted |
| S6 | **Shares after the lock:** the players' `Mestari` and `Putoaja` picks as percentages, from 3 guesses, as specs/073's shares |
| S7 | **A section `Kauden arvaukset` on `/arvauspeli`, above `Tulevat ottelut`:** before the lock a form per kind, with its price; after it the player's guesses; once settled what each paid |
| S8 | **The floor (072 S15) stays match-only.** A player who joins after the lock has no season guesses. Season guesses count in the balance and on the leaderboard as any other ledger row |
| S9 | **The teams are those of the season's stored `Runkosarja` fixtures** when the guess is placed. A team that withdraws mid-season has no final place: a guess naming it misses on that team, and is judged on the rest |
| S10 | **No rarity bonus on season guesses.** specs/073's rule is about a single match's 1X2 |
| S11 | **The strings below are drafts, fine-tuned in implementation** |
| S12 | **A group shown from TASO's own numbers** (a point deduction, specs/061 S15) **is judged by that table**, the one the standings page shows (S4) |
| S13 | **A season guess cannot be cancelled**, only changed: a refund would make placing a free option to wait |
| S14 | **The rules assume today's format**: a 12-team `Runkosarja` that splits six and six. A change of format changes these rules, in a spec of its own; 075 has no rule for it |
| S15 | **A lock once passed stays passed**: if round 1 is postponed after its kickoff time, the guesses stay locked |
| S16 | **A season not completed**: a guess still unsettled when the next season's first fixture is stored is void, and its price refunded |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation, as in specs/072.

- **The section**, a fold like the others, open, above `Tulevat ottelut`:
  `Kauden arvaukset`. Shown to a joined player in the season in play, and
  between seasons once the next season's fixtures are stored (072 S23).
- **Before the lock**, under the heading: "Arvaa kausi ennen sen ensimmäistä
  ottelua {päivä} klo {aika}. Arvauksia voi muuttaa maksutta siihen asti."
  Then one block per kind:
  - `Mestari` — "Hinta 50 · oikein 200". One picker, "Valitse joukkue".
  - `Mestaruussarjan joukkueet` — "Hinta 50 · 15 jokaisesta oikeasta". Twelve
    checkboxes, exactly six chosen: "Valitse kuusi joukkuetta."
  - `Putoaja` — "Hinta 50 · oikein 200". One picker.
  - `Lopullinen sarjataulukko` — "Hinta 100 · 30 oikeasta sijasta, 10 yhden
    sijan päästä". Twelve pickers, `Sija 1` to `Sija 12`, each team once:
    "Jokainen joukkue vain kerran."
  - The button names its kind, so no two are alike: `Arvaa mestari`, `Arvaa
    joukkueet`, `Arvaa putoaja`, `Arvaa sarjataulukko`; once placed, `Tallenna
    muutos`, with "Arvauksesi: {joukkue}" above it.
  - Too few tokens: "Pelimerkit eivät riitä." on that kind's block.
- **After the lock:** each kind's line, "Arvauksesi: {…}", and the shares for
  `Mestari` and `Putoaja`: "Pelaajien arvaukset: HJK 40 % · KuPS 30 % · muut
  30 % (10 arvausta)".
- **Settled:** "Oikein, +200" or "Ohi" for `Mestari` and `Putoaja`; "4
  oikein, +60" for the six; "3 täsmälleen oikein, 5 yhden sijan päästä, +140"
  for the table.
- **A player who has not joined, or joined after the lock:** no section.

## API & Data

- **A table of season guesses:** one row per player, season and kind, with the
  teams as provider team ids in order, the price paid, when it was placed and
  last changed, and when settled with its reward. One per player, season and
  kind by a unique index.
- **The ledger** (specs/072) gains a kind for a season guess's price and one
  for its reward, each referencing the season guess, at most one each per
  guess by partial unique indexes, as specs/073's bonus. A free change writes
  no ledger row.
- **Placing and changing** are server actions, checked on the server: joined,
  before the lock, the teams are the season's stored teams, the shape of the
  kind (one, six distinct, one, twelve distinct), and the balance for a first
  placement. The balance read and the ledger write share a transaction with a
  lock on the player, as 072's guesses do.
- **The lock** is the earliest stored kickoff of the season's `Runkosarja`,
  read at the time of the request.
- **Settling** (072 S11) runs after the match guesses in the hourly run; one
  transaction per season guess, so a racing run cannot pay twice.
- **Caching:** none; the rows are read per page view, signed in only.

## Edge Cases

| Case | Behaviour |
|---|---|
| A guess sent after the lock | Refused: "Kauden arvaukset ovat lukittuneet." The page reads the locked view |
| A first placement without enough tokens | Refused, "Pelimerkit eivät riitä." Nothing written |
| A change after a payout or a spend lowered the balance | Allowed: a change is free |
| A team not in the season's stored fixtures, a repeated team, the wrong count | Refused, nothing written |
| The regular season's last match is postponed | `Mestaruussarjan joukkueet` waits until it is played |
| A team withdraws mid-season | S9: that team misses; the rest are judged |
| A player deletes their account | Their season guesses go with it, as their match guesses (072) |
| The season's fixtures are not stored yet | No section; 072 S23's line |
| A table shown from TASO's own numbers (specs/061 S15) | S12: judged by that table |
| Cancelling a season guess before the lock | S13: not offered |
| A season that does not split six and six | S14: the rules change with the format; no rule here |
| The first match postponed after the lock has passed | S15: still locked |
| A season not completed | S16: void and refunded when the next season's first fixture is stored |

## Performance & Limits

At most four rows per player per season, settled once. Placing reads the
season's teams and first kickoff, a few hundred rows at most. No measurable
load.

## Security & Secrets

No new variables or secrets. Every check is on the server; the form's limits
are a convenience.

## Logging

- **Placed or changed:** `info`, "Arvauspeli season guess placed" or
  "… changed", with the user id, season, kind and price.
- **Refused:** `info`, "Arvauspeli season guess refused", with the user id,
  season, kind and the reason (`locked`, `balance`, `teams`).
- **Settling:** `info`, "Arvauspeli season guesses settled", with `settled`,
  `rewarded` (those that paid), `voided` and `failed`, beside specs/072's line
  for the match guesses. A season guess that fails to settle is logged at
  `error` with its id and named in the run's failures.
- Ids only; no team names are needed, no nickname or email.

## Acceptance Criteria

- [ ] A joined player can place each of the four season guesses on `/arvauspeli` before the season's first stored kickoff, paying its price once
- [ ] A season guess can be changed for free until the first kickoff, and is refused after it
- [ ] A guess with a team outside the season, a repeated team or the wrong number of teams is refused, and so is a first placement the balance cannot pay
- [ ] After the regular season's last match, the hourly run pays 15 for each of the guessed six that reached `Mestaruussarja`
- [ ] After both groups' last matches, the hourly run pays 200 for a right champion, 200 for a right 12th place, and 30 for each exact place and 10 for each place one off in the table
- [ ] No season guess is paid twice, and none pays a rarity bonus
- [ ] A season guess still unsettled when the next season's first fixture is stored is void and its price refunded
- [ ] After the lock the section shows the player's guesses and the shares of the champion and last-place picks, and once settled what each paid
- [ ] The spec answers which season guesses exist, what each costs and pays, and when each locks (#759)
- [ ] The spec answers whether specs/061's season simulation plays as the model (#759)

## Tests Required

- `tests/unit/lib/` (a file of its own): each kind's reward at each case,
  the table's exact and one-off counts, a withdrawn team, the final place from
  the two groups.
- `tests/unit/lib/guessing-game-store.test.ts` or its own: placing, changing
  free, the lock, each refusal, and their log lines.
- `tests/integration/`: settling each kind once against Postgres; the unique
  indexes; a racing run paying nothing twice.
- `tests/unit/components/`: the section before the lock, after it, settled.
- `tests/e2e/`: a player places and changes a season guess, and sees it locked
  and settled; on an empty `_test` database as well.

## Files To Update

- `specs/075-season-guesses.md`
- `docs/infrastructure.md` (the hourly run settles season guesses)
- The privacy page, if it lists the game's stored data by kind

## Open Questions

None.

## Notes

Timing (#759): guesses must open before the first round of the season they are
first played in, or they wait a year. Veikkausliiga 2027 starts in the spring,
so 075 is released before its first stored kickoff, with the rest of the game.
