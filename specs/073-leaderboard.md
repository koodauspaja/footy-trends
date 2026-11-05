# 073 — Arvauspeli: leaderboard

## Summary

Players of `Arvauspeli` see how they do against each other: a season's
leaderboard ranked by balance, under each player's nickname, the players'
guesses on a match once it has kicked off, and a bonus for a correct guess few
others made. Builds on specs/072 and specs/076 (#748).

## Scope

### In scope

- **One leaderboard per season** on `/arvauspeli`, ranked by balance, seen by
  signed-in readers only (S1, S4, S5).
- **Players shown by their nickname** from 077 (#763), or "Nimetön pelaaja"
  while they have none (S2).
- **The players' guesses on a match after its kickoff**, as shares, on the
  player's own waiting and settled rows (S6).
- **A rarity bonus**: a correct 1X2 that few of the match's guesses shared pays
  more (S7).
- The privacy page says other players see a player's nickname and balance.

### Out of scope

- **Setting up and editing the nickname**, its rules and keeping offensive ones
  out: specs/077 (#763), merged before this, and released with it.
- **Private groups:** 078 (#764).
- **Avatars** on the leaderboard (S3).
- **Another player's own guesses**, one by one, and a page per player (S6).
- Anything specs/072 and specs/076 settle: prices, tiers, rewards, settling.
- The models' guesses and rewards for beating them (074).
- Season guesses (075).
- Leaderboards of earlier seasons: 2027 is the game's first.

## Settled decisions

| # | Decision | Source |
|---|---|---|
| S1 | **One public leaderboard per season.** Private groups are a spec of their own, 078 (#764) | Miikka, 2026-11-05 (Q1): "yes"; "file an issue for the private groups" |
| S2 | **A player is shown by the nickname 077 sets up, never the account's name**, which is the Google real name. With none, "Nimetön pelaaja". Setting it up and editing it are 077's | Miikka, 2026-11-05 (Q2): "for now, that's fine. editing that name later is part of the feature"; "file an issue for the user to set up their nickname" |
| S3 | **No avatars on the leaderboard** | Miikka, 2026-11-05 (Q3): "as suggested" |
| S4 | **The balance is ranked**, listing only players with at least one guess in the season. The late joiner's share (072's S14) keeps balances comparable | Miikka, 2026-11-05 (Q4): "yes" |
| S5 | **Only signed-in readers see the leaderboard**, players or not | Miikka, 2026-11-05 (Q5): "only signed in can see it" |
| S6 | **Nothing of others' guesses before kickoff.** After it, the shares of 1, X and 2 on each match the player guessed, with 3 guesses or more on the match. No one's guesses one by one | Miikka, 2026-11-05 (Q6): "as suggested" |
| S7 | **The rarity bonus, +20**, on a guess whose 1X2 was right when at most a quarter of the match's guesses had it right, with 5 guesses or more. Only on a match settled as played; an awarded, abandoned or void one (076) pays none | Miikka, 2026-11-05 (Q7): "if it's complicated, no extra bonus. if simple, then as suggested". Judged simple: the settling run already holds every guess of the match in one transaction, so the bonus is one rule and one more ledger row there |
| S8 | **The strings below are drafts, fine-tuned in implementation** | As specs/072's S20 |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (S8).

- **`Tulostaulukko`**, a section of `/arvauspeli` after `Tulevat ottelut`,
  folding by its `h2` like 072's, starting open: "Tulostaulukko ({n}
  pelaajaa)". Each row: the rank, the nickname, the balance, and the number of
  settled guesses ("{n} ratkaistua"). The player's own row is highlighted, and
  shown below the list when it is not in the top 50.
- **A player without a nickname:** ranked, and listed as "Nimetön pelaaja".
- **Empty:** "Kukaan ei ole vielä arvannut tällä kaudella."
- **Signed in, not joined:** 072's join text, and the leaderboard under it.
- **Signed out:** 072's sign-in line only, no leaderboard (S5).
- **The players' guesses**, on the player's own rows under `Odottavat tulosta`
  and `Ratkaistut`: "Pelaajien arvaukset: 1 {a} % · X {b} % · 2 {c} % ({n}
  arvausta)".
- **The rarity bonus** on a settled row: "Harvinainen osuma +20", after the
  tier's own line.
- **The privacy page:** 077 already says other signed-in users see the
  nickname on the leaderboard; the game's line adds the balance: "Arvauspelin
  arvauksesi ja pelimerkkisi. Muut kirjautuneet käyttäjät näkevät pelimerkkisi
  arvauspelin tulostaulukossa."


## API & Data

- **The balance** stays the ledger's sum (specs/072). The leaderboard is that
  sum per player for the season, the bonus included.
- **The bonus** is a ledger row of its own, kind `bonus`, written in the same
  transaction as the guess's reward, and at most one per guess, by a unique
  index as 072's settlement index.
- **The shares** count every guess on the match settled as played or still
  waiting after kickoff, a score guess by its 1X2. A void or refunded guess
  (076) is not counted.
- **The nickname** is read from `user_nickname` (specs/077).
- **Reading:** the page reads stored rows only. No provider call.
- **Caching:** none. The board changes once an hour at most and is one grouped
  query, so the page reads it per request, as the rest of `/arvauspeli`.

## Edge Cases

| Case | Behaviour |
|---|---|
| Two players on the same balance | The same rank; ordered by nickname, "Nimetön pelaaja" last |
| A player who has joined but never guessed this season | Not listed (S4) |
| A late joiner (072's S14) | Ranked by balance like everyone (S4) |
| A player at the floor (072's S15) | Listed with their balance, as anyone |
| A player without a nickname | "Nimetön pelaaja" (S2) |
| A signed-in reader who has not joined | Sees the leaderboard (S5) |
| The shares before kickoff | Not shown, on any row, the player's own included (S6) |
| A match with fewer than 3 guesses | No shares, so a player's guess cannot be read off them (S6) |
| A match with fewer than 5 guesses | No bonus (S7) |
| Exactly a quarter of the guesses right | The bonus is paid (S7) |
| An awarded, abandoned or void match (076) | No bonus (S7) |
| A score guess | Counted in the shares and the bonus by its 1X2 |
| A free guess (072's S15) | Counted, and can earn the bonus, as any guess |
| A result corrected after settling | 072's S9: the bonus is not settled again either |
| A player who deletes their account | Gone from the board and from every share; a bonus already paid to others stays |
| Between seasons (072's S23) | The finished season's board stays until the next season opens |

## Performance & Limits

- One grouped sum over the season's ledger rows, top 50 plus the player's own
  row. Hundreds of players at most; no measurable load expected.
- The shares are one grouped count over the player's listed matches.

## Security & Secrets

No new variables or secrets. The page checks the session on the server before
reading the board. Nicknames are rendered as text, never as HTML.

## Logging

- **Bonus:** counted in 072's `Arvauspeli guesses settled` line, as `bonuses`.
  A failure is 072's per-match `error`, since it is the same transaction.
- **Reading the board:** a failure logs `error` as 072's page read does.
- Ids only: no email address, account name or nickname.

## Acceptance Criteria

- [ ] `Tulostaulukko` ranks the season's players with at least one guess by balance, and shows their nickname, never the account name
- [ ] A player without a nickname is listed as "Nimetön pelaaja"
- [ ] Two players on the same balance share a rank
- [ ] The player's own row is shown when they are outside the top 50
- [ ] Signed out, `/arvauspeli` shows no leaderboard; signed in and not joined, it shows one
- [ ] The players' shares on a match show only after its kickoff, and only with 3 guesses or more
- [ ] After the hourly run, a correct 1X2 shared by at most a quarter of the match's guesses, with 5 or more, pays +20 on top of its reward, and the balance includes it
- [ ] An awarded, abandoned or void match pays no bonus
- [ ] The privacy page says other signed-in users see the nickname and balance

## Tests Required

- `tests/unit/lib/guessing-game.test.ts`: the bonus at each boundary (4 and 5
  guesses, a quarter exactly and one more); the shares' threshold (2 and 3); a
  score guess counted by its 1X2; ranks with ties.
- `tests/integration/guessing-game.test.ts`: the board's order and ties; a
  player with no guess left out; the bonus written once, with the reward, and
  not on a second run; a void guess left out of the shares and the bonus;
  deleting a user removes them from the board.
- `tests/e2e/guessing-game.spec.ts`: the board signed in, with a nickname and
  with "Nimetön pelaaja"; no board signed out; on an empty `_test` database as
  well.

## Files To Update

- `specs/073-leaderboard.md`
- `src/app/privacy/page.tsx`
- `docs/infrastructure.md`, if the settling run's printed output changes

## Open Questions

None.
