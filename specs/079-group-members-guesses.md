# 079 — Arvauspeli: members' guesses on a group's page

## Summary

On a private group's page, members see each other's guesses on a match one by
one once it has kicked off: who guessed what, and what it paid. The public board
shows no one's guess one by one (specs/073 S6); a group is people who chose to
play together. Builds on specs/072, specs/073, specs/074, specs/076 and
specs/078 (#748).

## Scope

### In scope

- **A section `Jäsenten arvaukset`** on the group's page, `/arvauspeli/ryhmat/{id}`,
  between `Tulostaulukko` and `Jäsenet` (S1).
- **The season's kicked-off matches that a member guessed**, newest first, ten
  at a time (S1).
- **Each member's guess on each**, with how it was settled and what it paid
  (S2), and the models' line once per match (S2).
- **A line on the invite page and the group's page** saying members see each
  other's guesses after kickoff, and the privacy page saying the same (S4).

### Out of scope

- **Anything before kickoff:** nothing of anyone's guess shows before it
  (specs/073 S6), here included.
- **The public board**, which still shows no one's guess one by one.
- **Season guesses one by one** (S3). The shares after the lock stay as
  specs/075 S6 has them.
- **A member hiding their guesses from a group** (S5).
- **Rewards or bonuses of a group's own** (specs/078 S4).

## Settled decisions

All from Miikka, 2026-11-06: "suggestions good", on the questions as suggested
(S1–S5).

| # | Decision |
|---|---|
| S1 | **A section `Jäsenten arvaukset` on the group's page after `Tulostaulukko`:** the season's kicked-off matches that any member guessed, newest kickoff first, ten at a time, with "Näytä aiemmat ottelut" for ten more. Not by round: a round's matches spread over days, and a postponed one would sit in the wrong round |
| S2 | **A row shows the guess, and once settled the lines the player's own `Ratkaistut` shows**, the rarity bonus and the models' reward included. The models' line once per match, not per member |
| S3 | **No row for a member who did not guess a match**, only the count "Arvasi {n}/{m} jäsentä". **Season guesses are not shown one by one**: their shares already show after the lock (specs/075 S6); members' `Mestari` and `Putoaja` picks could be a follow-up |
| S4 | **Every current member's guesses for the whole season**, made before or after they joined: the page shows the group as it is now. The invite page says so before anyone joins, and the privacy page says it too |
| S5 | **No opt-out:** being in the group is the choice, and leaving it takes one's guesses off its page |
| S6 | **The strings below are drafts, fine-tuned in implementation**, as specs/072's S20 |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (S6).

- **`Jäsenten arvaukset`**, an `h2` section of the group's page after
  `Tulostaulukko`, with "Arvaukset näkyvät ottelun alettua." under it.
  - A block per match, newest kickoff first: the match as on `Ratkaistut`
    ("HJK 2–1 KuPS", or "HJK – KuPS" before a result), its day and time, and
    "Arvasi {n}/{m} jäsentä".
  - A row per member who guessed it, by nickname, "Nimetön pelaaja" for one
    with none, the reader "(sinä)":
    - the guess: "1", "X", "2" or "2–1";
    - once settled, specs/072's and specs/076's line for it, "Oikea tulos
      +100", "Oikea merkki +30", "Ei osunut", "Ottelu keskeytettiin,
      pelimerkit palautettu" and so on, then "Harvinainen osuma +20" and
      "Voitit mallit +{n}" when paid;
    - before then, "Odottaa tulosta".
  - Under the rows, the models' line as on the player's own rows, "Mallit: Elo 1
    · … · Poisson 2–1" (specs/074 S6), when the models guessed the match.
  - After ten matches, "Näytä aiemmat ottelut", a link to the same page showing
    ten more (S1).
  - None yet: "Kukaan ryhmästä ei ole vielä arvannut alkanutta ottelua tällä
    kaudella."
  - A failed read: "Jäsenten arvausten lataaminen epäonnistui. Yritä myöhemmin
    uudelleen."; the rest of the page is shown.
- **The invite page**, under the group's name: "Ryhmän jäsenet näkevät
  toistensa arvaukset otteluiden alettua." (S4)
- **The privacy page**, the groups' line gains: "…ja toistensa arvaukset
  otteluiden alettua, myös ennen ryhmään liittymistä tehdyt." (S4)

## API & Data

- **Reading:** two queries over `game_guess` joined to `taso_matches`, for the
  group's current members (specs/078), the season the board shows, and matches
  whose stored kickoff has passed, the same rule specs/073's shares use: one
  choosing the page's matches, the newest any member guessed, and one reading
  the members' guesses on those. "Näytä aiemmat ottelut" lists ten more by the
  search parameter `ottelut` (S1).
- **What a row shows** is read as the player's own `Ratkaistut` reads it: the
  guess row's `tier` and result, and the ledger's `reward`, `refund`, `bonus` and
  `models` rows for the guess (specs/072, 073, 074, 076).
- **A guess made after kickoff**, refunded by specs/076, shows as settled with
  its void line; a guess still open after kickoff shows "Odottaa tulosta".
- **The models' line** is `readModelGuesses` (specs/074) for the listed matches.
- **Who sees it:** only members, checked on the server as the page is
  (specs/078). The kickoff rule is in the query, so nothing before kickoff
  reaches the page whatever the browser asks.
- **No new table, no migration.**
- **Caching:** none. Per request, as the rest of the game.

## Edge Cases

| Case | Behaviour |
|---|---|
| A match before its kickoff | Not listed, its guesses never read |
| A match postponed after a member guessed it | Listed only once its new stored kickoff has passed |
| A member who did not guess a listed match | No row; counted in "Arvasi {n}/{m}" (S3) |
| A match no member guessed | Not listed |
| A guess made after kickoff (specs/076's void) | Its row, with the void line |
| An abandoned, awarded or undecided match (specs/076) | Each row with specs/076's line |
| A member who joined the group after a match | Their guess on it is listed, as everyone's (S4) |
| A member who left, was removed or deleted their account | Their guesses go from the page with them |
| A free guess (specs/072 S15) | Shown as any guess |
| A member without a nickname | "Nimetön pelaaja" (specs/078 S9) |
| More than ten matches | Ten, newest first, and "Näytä aiemmat ottelut" (S1) |
| A search parameter past the last match | The matches there are, the link gone |
| Between seasons | The season the board shows (specs/078) |
| No season stored | The section is not shown, as the board says "Kausi ei ole vielä alkanut." |

## Performance & Limits

- Ten matches × at most 50 members: 500 rows a page at most, by two queries,
  plus the ledger rows of those guesses and the models' rows of ten matches.
- The members' read goes by user id, the leading column of
  `game_guess_identity_idx (user_id, taso_match_id)`: at most 50 players' rows
  of one season. No new index.

## Security & Secrets

No new variables or secrets. Membership is checked on the server before
anything is read; the kickoff rule is applied in the query. Nicknames are
rendered as text.

## Logging

- **A failed read:** `error`, `Reading Arvauspeli members' guesses failed`, with
  the user id and the group id; it costs only the section.
- The feature only reads; it writes nothing, so it logs no action.
- Ids only: no email address, account name, nickname or group name.

## Acceptance Criteria

- [ ] A member of a group sees, on its page, each member's guess on the season's matches that have kicked off, and nothing on a match that has not
- [ ] Each row shows the guess, and once settled its line and what it paid, the rarity bonus and the models' reward included; before then "Odottaa tulosta"
- [ ] A match shows "Arvasi {n}/{m} jäsentä" and the models' line
- [ ] The newest ten matches show first, and "Näytä aiemmat ottelut" shows ten more
- [ ] A member who leaves the group takes their guesses off its page
- [ ] A reader who is not a member gets the 404, as before, and sees no guesses
- [ ] The invite page and the privacy page say members see each other's guesses after kickoff
- [ ] A failed read costs only the section, and is logged with ids only

## Tests Required

- `tests/unit/lib/guessing-game-group-store.test.ts`: the members' guesses read
  and its paging; the rows' settlement and payments.
- `tests/unit/components/guessing-game-groups.test.tsx`: each row's states,
  the count line, the models' line, the paging link, empty, failed.
- `tests/integration/guessing-game-group.test.ts`: a match before kickoff not
  read; a postponed one hidden until its new kickoff; a former member's guesses
  gone; the payments as the player's own rows show them.
- `tests/e2e/guessing-game-group.spec.ts`: two members' guesses on a played
  match, each seeing the other's; on an empty `_test` database as well.

## Files To Update

- `specs/079-group-members-guesses.md`
- `src/lib/guessing-game-group-store.ts`, `src/components/guessing-game-groups.tsx`,
  `src/app/guessing-game/groups/[id]/page.tsx`
- `src/app/privacy/page.tsx`

## Open Questions

None.
