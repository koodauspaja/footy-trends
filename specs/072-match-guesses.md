# 072 — Arvauspeli: match guesses and the token balance

## Summary

A signed-in reader can join `Arvauspeli`, get a season's balance of tokens, and
spend them to guess Veikkausliiga matches, either the 1X2 or the exact score.
Guessing earlier costs less, and correct guesses pay tokens back, so the balance
is the player's score. This is the first of the game's specs (#748): matches
that do not go as listed 076, leaderboard 073, the models 074, season guesses
075.

## Scope

### In scope

- **Joining**, once per account, signed in only (S1).
- **A balance per player per Veikkausliiga season**: the full starting balance
  for a player who joined before the season's first kickoff or in an earlier
  season, and a share for a player who joins later (S2, S14, S21).
- **Guessing a match**: one guess per player per match, either 1X2 (`1`, `X`,
  `2`) or an exact score. Its price depends on how long before kickoff it is
  made, and it locks at kickoff (S3, S13).
- **Changing a guess** before kickoff, at the current price, between kinds as
  well (S4, S19).
- **A floor**, so a player who runs out of tokens can always make the simplest
  guess (S5, S15).
- **Settling** each guess on a played match by the fixed reward table (S6, S7,
  S13), in the hourly `predictions` run (S11).
- **Which matches**: Veikkausliiga's regular season and both groups after the
  split (S10).
- **The page `/arvauspeli`**: the player's balance, the upcoming matches they can
  guess, their open guesses, and their settled guesses with what each paid. Plus
  its entry on the front page (S12).
- **The privacy page** names the game's stored data, and deleting the account
  deletes it.

### Out of scope

- **Matches that do not go as listed**: postponed, cancelled, abandoned,
  awarded, and a kickoff moved earlier (076). Until 076, a guess on a match
  that is not played as listed stays open. **072 and 076 are released together,
  before the 2027 season's first kickoff**, so no guess is ever settled without
  076's rules (S9 makes a settlement final).
- **The relegation play-off** (S10). It is not stored, and is not worth
  fetching for now.
- Other players: the leaderboard, groups, and seeing others' guesses (073).
- The models' guesses and rewards for beating them (074).
- Season guesses, such as the Mestaruussarja six and final positions (075).
- A guess box on the match page (S22).
- Competitions other than Veikkausliiga (#748).
- Real money of any kind. Tokens cannot be bought, sold or exchanged, and no
  prize has money's worth (#748).
- An admin view, or correcting a player's balance by hand.

## Settled decisions

S8, S16 to S18, S24 and S25 were settled here and moved with their rules to
specs/076.

| # | Decision | Source |
|---|---|---|
| S1 | **Opt-in.** A signed-in reader presses `Liity peliin`, and is a player from then on, in every later season too. A reader who never joins has no balance and no rows | Miikka, 2026-11-04 (Q1): "opt-in" |
| S2 | **A late joiner gets a share of the starting balance**, by what is left of the season when they join (S14) | Miikka, 2026-11-04 (Q2): "share based on what's remaining of the season" |
| S3 | **The price is by time before the stored kickoff, not by round. A guess locks at kickoff** | Miikka, 2026-11-04 (Q3): "agree" |
| S4 | **Changing a guess pays the current price on top.** What was paid for the earlier guess is not returned | Miikka, 2026-11-04 (Q4): "current price on top" |
| S5 | **A floor lets a player with too few tokens make the simplest guess, a 1X2, and get back into the game** (S15) | Miikka, 2026-11-04 (Q5) |
| S6 | **A score guess is judged by tiers: exact score, then goal difference, then 1X2.** Only the highest tier reached pays. A draw guessed as a different draw reaches goal difference | Miikka, 2026-11-04 (Q6): "suggestion ok" |
| S7 | **Rewards are a fixed table, and an exact score pays back more than a correct 1X2** (S13) | Miikka, 2026-11-04 (Q7) |
| S9 | **The first settlement is final.** A result TASO corrects later does not change it | Miikka, 2026-11-04 (Q9): "first is final" |
| S10 | **Which matches: the regular season and both groups after the split.** The relegation play-off is left out: it is not stored, and fetching it is not worth it for now | Miikka, 2026-11-04 (Q10), and on the play-off (Q26): "the relegation/promotion match is not that important atm". Measured on production, read-only, 2026-11-04: no match of 2024, 2025 or 2026 between a Veikkausliiga team and another team is stored outside `VL`, though the zones name `Liigakarsintaan` and `Jatkaa liigakarsintaan` |
| S11 | **Guesses are settled by the hourly `predictions` run**, once it has refreshed a finished match, not on a page view. Staging has no cron, so it is settled by hand there | Miikka, 2026-11-04 (Q11): "suggestion ok" |
| S12 | **The game is called `Arvauspeli`, at `/arvauspeli`.** No "veikkaus" in its name or URL, since Veikkaus is the state gambling company | Miikka, 2026-11-04 (Q12): "Arvauspeli is good" |
| S13 | **The figures.** Starting balance **1 000**. Price, the same for both kinds, by hours before the stored kickoff: **10** at 168 h or more, **15** from 72 h, **20** from 24 h, **30** under 24 h. Rewards: a **1X2 guess**, correct: **30**. A **score guess**: exact **100**, goal difference **40**, 1X2 only **20**, otherwise **0** | Miikka, 2026-11-04 (Q13): "suggestions good". Guessing all 177 matches at the earliest price costs 1 770, so a player has to choose, or win to keep going. A score guess's 1X2 tier pays less than a 1X2 guess, so a 1X2 guess still has a point |
| S14 | **The share:** 1 000 × the season's matches not yet kicked off ÷ all its matches, rounded down. Before the split, the split groups' matches are not stored yet, so they are counted as the previous stored season had them | Miikka, 2026-11-04 (Q14): "suggestions good". 2025 and 2026 both have 132 + 30 + 15 = 177 |
| S15 | **The floor:** a player whose balance is below the cheapest price among the season's matches open to guesses now, and who has no open guess in any season, may make **one free 1X2 guess at a time.** Its reward is paid as usual. It cannot be changed, since a change would have to be paid | Miikka, 2026-11-04 (Q15): "suggestions good"; the cheapest price in place of each match's own, 2026-11-05: "your suggestions are good". By each match's price, 25 tokens opened a free guess on a match costing 30, and the page told a player who could pay two guesses that they had none. Topping the balance up would put tokens into the ledger that nothing earned. 076 gives it a free change after a postponement. The cheapest open match's price in place of the fixed 10, Miikka, 2026-11-05: option A (`decisions/766-floor-by-open-prices.md`). By the fixed 10, a late joiner's 16 tokens paid no match open at 20 and opened no floor either |
| S19 | **A guess can change kind**, 1X2 to score and back, at the current price (S4) | Miikka, 2026-11-04 (Q19): "suggestions good" |
| S20 | **The strings below are drafts, fine-tuned in implementation** | Miikka, 2026-11-04 (Q21): "suggestions good" |
| S21 | **A player who joined in an earlier season gets the next season's full balance**, with no action of their own | Miikka, 2026-11-04 (Q22): "suggestions good" |
| S22 | **No guess box on the match page in 072.** Guessing is on `/arvauspeli` only | Miikka, 2026-11-04 (Q23): "suggestions good" |
| S23 | **Between seasons:** `/arvauspeli` shows the season in progress until its last match is settled, then the next once its first fixture is stored, and "Kauden {year} ottelut julkaistaan myöhemmin." in between. A reader can join in between, and gets the full balance when the season opens | Miikka, 2026-11-04 (Q22): "suggestions good" |
| S26 | **A guess is charged only the price its row showed.** If the price has changed since the page was read, the guess is refused with "Hinta on muuttunut. Tarkista uusi hinta." and the page reads the new price | Miikka, 2026-11-05: "your suggestions are good". Otherwise a guess sent just after a price step, or a free guess after a payout lifted the balance, was charged without warning |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (S20).

- **Front page:** a new entry after `Ennusteet`:
  `{ href: "/arvauspeli", label: "Arvauspeli", description: "Arvaa Veikkausliigan otteluita" }`.
- **`/arvauspeli`, signed out:** the heading and "Kirjaudu sisään pelataksesi.",
  with the usual sign-in button.
- **Signed in, not joined:** "Arvaa Veikkausliigan otteluiden tuloksia
  pelimerkeillä. Pelimerkkejä ei voi ostaa, myydä eikä vaihtaa mihinkään." and the
  button `Liity peliin`. After the season's first kickoff, a line above the
  button says what joining gives: "Kausi on jo alkanut: saat {n} pelimerkkiä,
  osuutena jäljellä olevista otteluista."
- **Joined, at the top:** "Pelimerkit: {balance}" (thousands separated with a
  space, as elsewhere).
- **`Tulevat ottelut`:** every guessable match in kickoff order, grouped by date
  (Helsinki time), with the group name when there is more than one
  (`Mestaruussarja`, `Karsintasarja`). Each row has:
  - the teams and the kickoff,
  - the choice `1` / `X` / `2`, or `Arvaa tulos` with two number inputs,
  - "Hinta nyt {price}" and, when the price will rise, "nousee {next} {date}",
  - the button `Arvaa`, or `Muuta arvausta` when the player has a guess on it.
    A change shows its price: "Muutos maksaa {price}".
- **The player's guess on a row:** "Arvauksesi: 2–1" or "Arvauksesi: 1".
- **`Ratkaistut`:** the player's settled guesses, newest first: the match, the
  result, the guess, and what it paid: "Oikea tulos +{n}", "Oikea maaliero
  +{n}", "Oikea merkki +{n}", "Ei osunut".
- **The floor (S15):** "Pelimerkkisi eivät riitä arvaukseen. Voit tehdä yhden
  maksuttoman 1X2-arvauksen kerrallaan."
- **Refusals**, shown under the row: "Ottelu on jo alkanut.", "Pelimerkit eivät
  riitä.", "Hinta on muuttunut. Tarkista uusi hinta." (S26), "Arvausta ei voitu
  tallentaa. Yritä uudelleen."
- **Between seasons (S23):** "Kauden {year} ottelut julkaistaan myöhemmin."
- **The privacy page:** "Arvauspelin arvauksesi ja pelimerkkisi." in the list of
  stored data, and "arvauspelin tiedot" in the list of what deleting the account
  removes.

## API & Data

- **Storage**, in the database: players (user, joined at), guesses (player,
  stored TASO match, kind, the 1X2 or the score, made at), and one append-only
  ledger of token movements: grant, guess, change, reward, each with its amount
  and the guess it belongs to. 076 adds refunds. **The balance is the ledger's
  sum**, never a stored figure of its own. The tables' shape is the
  implementation's (decisions/072).
- **A season's grant** is written once per player per season: at joining, by
  S14, and for a player who joined earlier when they first open `/arvauspeli`
  in the season or first guess in it, by S21.
- **Writing:** server actions to join, guess and change. Each checks the
  player, the match (S10), the kickoff against the server's clock, and the price
  against the balance, and writes the guess and its ledger row in one
  transaction. A second guess racing the first cannot spend the same tokens.
- **Settling:** a step in `npm run predictions -- log`, after it refreshes
  matches. It settles every unsettled guess whose match is `FINISHED` with a
  score, and writes one reward row per guess, `0` included, so a settled guess
  is never settled again (S9). `npm run predictions -- settle` runs the step
  alone, for staging.
- **Reading:** the page reads stored matches and the player's rows only. No
  provider call on a page view and no Redis cache: the data is per player and
  changes on each guess.
- **Caching:** the hourly run refreshes TASO through its existing 15-minute
  response cache (`MATCHES_CACHE_TTL_SECONDS`), as for its predictions; the game
  adds no provider call and no cache of its own.

## Edge Cases

| Case | Behaviour |
|---|---|
| A guess at or after the stored kickoff | Refused: "Ottelu on jo alkanut." |
| A guess the balance cannot pay | Refused: "Pelimerkit eivät riitä.", or the floor's free 1X2 (S15) |
| A floor guess already open | A second free guess is refused until it settles |
| A balance that pays a cheaper open match but not this one | Refused: "Pelimerkit eivät riitä."; the floor is not open (S15) |
| A balance of 10 or more that pays no open match | The floor's free 1X2 (S15) |
| No match open to guesses | No floor: there is nothing to guess (S15) |
| The price changed after the page was read | Refused with S26's line, nothing charged |
| A match not played as listed | Its guesses stay open; 076 settles them |
| A result corrected after settling | S9: not settled again |
| A match whose result arrives late | Settled by the first hourly run that has it |
| `FINISHED` with no score | Not settled by 072; 076 (awarded with no score) |
| Two guesses sent at once | One wins; the other is refused, or replaces it priced as a change |
| A late joiner | S14's share, shown before they join |
| A player who deletes their account | Their players, guesses and ledger rows go with it |
| Between seasons | S23 |

## Performance & Limits

- 177 matches a season. Settling a match is one query over its guesses. No
  measurable load expected.
- The page reads one season's matches and one player's rows.

## Security & Secrets

No new variables or secrets. Every write is the signed-in player's own. The
server's clock decides the lock, never the browser's.

## Logging

- **Join and grant:** `info`, user id, season, the amount.
- **Guess and change:** `info`, user id, TASO match id, kind, price, and the
  outcome, a refusal included with its reason. No guess content beyond the kind.
- **Settling:** `info`, one line per run: matches settled, guesses rewarded and
  missed. `error` for a failed settlement, with the match id. The run continues
  with the next match.
- Ids only: no email address or name.

## Acceptance Criteria

- [ ] `/arvauspeli` signed out shows the sign-in line and no balance; signed in and not joined, it shows `Liity peliin`
- [ ] Joining before the season's first kickoff gives 1 000; joining later gives S14's share, and the page says the figure before the button is pressed
- [ ] A player who joined in an earlier season has 1 000 in the next one with no action of their own
- [ ] A 1X2 guess and a score guess each cost 10, 15, 20 or 30 by the hours before kickoff, and the balance drops by that much
- [ ] A guess at or after the stored kickoff is refused with "Ottelu on jo alkanut."
- [ ] A change costs the current price on top, including a change of kind
- [ ] A player below the cheapest price among the matches open now, with no open guess, can make one free 1X2 guess, and not a second while it is open
- [ ] A guess whose price changed after the page showed it is refused with "Hinta on muuttunut. Tarkista uusi hinta." and charges nothing
- [ ] After the hourly run, a correct 1X2 guess pays 30, and a score guess 100, 40, 20 or 0 by its highest tier
- [ ] A settled guess does not change when the result is later corrected
- [ ] Runkosarja, Mestaruussarja and Karsintasarja matches can all be guessed
- [ ] The privacy page names the game's data, and deleting the account removes it
- [ ] `npm run predictions -- settle` settles on staging

## Tests Required

- `tests/unit/lib/guessing-game.test.ts`: the price at each boundary (168 h,
  72 h, 24 h, kickoff); every tier of S6, a draw as goal difference included;
  S14's share before and after the split; the floor's conditions.
- `tests/integration/guessing-game.test.ts`: join, guess and change against the
  database; the balance as the ledger's sum; a refusal writes nothing; two
  concurrent guesses spend once; a second settling run changes nothing (S9); a
  match not `FINISHED` is left open; deleting the user removes every row.
- `tests/e2e/guessing-game.spec.ts`: sign in, join, make a 1X2 and a score guess
  on the stand-in's fixtures, change one, see the balance; on an empty `_test`
  database as well.

## Files To Update

- `specs/072-match-guesses.md`
- `src/app/privacy/page.tsx` (the stored data)
- `src/app/page.tsx` (the front-page entry)
- `next.config.ts` (`/arvauspeli`)
- `docs/infrastructure.md` (the cron's settling step, and `settle` on staging)

## Open Questions

None.
