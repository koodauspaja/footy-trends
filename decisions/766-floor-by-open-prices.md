# 766 — Arvauspeli: the floor opens below the cheapest open match's price: decisions

Bug #766, `specs/072-match-guesses.md` (S5, S15). A player whose balance was 10
or more but below every open match's price could not guess at all: a late
joiner's share of 16 paid no match open at 20, and the floor stayed shut,
because it opened only below the cheapest price on the table, 10. This
overrides `decisions/072-match-guesses.md`, "The floor is the player's, not a
match's", where the floor opens "below the cheapest price, 10". The rest of that
row stands: the floor is the player's, and no guess of theirs may wait to be
settled, in any season.

| Decision | Why |
|---|---|
| The floor opens when the balance is below the cheapest price among the season's matches open to guesses now (`cheapestOpenPrice`), and no guess of the player's waits to be settled | Miikka, 2026-11-05: option A. A player who can pay some open match pays for it; one who can pay none gets the free 1X2, which is the player S5 means |
| The threshold is one figure for the player, the minimum over every open match, decided once per page and once per guess, never a row's own price | So 072's reason for the fixed 10 still holds: 25 tokens open no free guess on a match costing 30 while a match costing 10 to 25 is open, and the page never tells a player who can pay a guess that they have none |
| A match is open by `guessPrice`, the rule that lists it in `Tulevat ottelut` and accepts a guess on it, whether or not the player has guessed it | One rule on both sides. A match the player has an unsettled guess on shuts the floor anyway, so counting it changes nothing |
| `placeGuess` reads the season's matches under the player's lock, as it already did for the grant, and decides the floor from them with the clock it charges by | The page and the write agree, and a price step passed while the guess waited for the lock moves both the price and the threshold |
| With no match open to guesses, the floor is shut | There is nothing to guess; `mayUseFloor` takes a `null` cheapest price for it |
| `LOWEST_PRICE` is removed | Nothing reads the fixed 10 any more |
| Tests: unit for `cheapestOpenPrice` and `mayUseFloor` at the boundaries (a balance equal to and one under the cheapest open price, none open) and `decideGuess` with 16 against 20; the store's page and guess over a season with a cheaper match open and without one. Integration for the issue's late joiner, 16 tokens against two matches at 20, and for a balance that pays a cheaper open match being refused on a dearer one | The issue's steps, and the case 072 reworded S15 for |
