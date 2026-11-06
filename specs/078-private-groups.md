# 078 — Arvauspeli: private groups

## Summary

Players of `Arvauspeli` form private groups, for example a group of friends,
joined by an invite link, each with its own leaderboard of the same balances as
the public one (specs/073). Builds on specs/072, specs/073, specs/075 and
specs/077 (#748).

## Scope

### In scope

- **Creating a group**, by any player who has joined the game (S1).
- **Joining by an invite link**, which the group's owner can renew (S2).
- **Several groups per player**, up to a limit, and leaving one (S1, S3).
- **The owner's tools:** renaming the group, renewing its link, removing a
  member, deleting the group; ownership passing on when the owner leaves (S3).
- **A group's leaderboard**: its members ranked by their season balance, as
  specs/073 ranks everyone (S4).
- **A group's name**, its rules and the word list (S7).
- **A section `Ryhmät` on `/arvauspeli`, a page per group and an invite page**
  (S6).
- The privacy page names the groups a user belongs to and who sees them.

### Out of scope

- **Rewards or bonuses of a group's own** (S4).
- **Seeing more of a group's members' guesses than the public board shows**
  (S5). A follow-up issue, if wanted.
- **Joining by a typed code or by an invitation by name** (S2).
- **An admin view of groups** (S8).
- Anything specs/072 to specs/077 settle: prices, rewards, settling, the public
  board, nicknames.
- Groups in other competitions: Veikkausliiga only, as the game (#748).

## Settled decisions

All from Miikka, 2026-11-06: "suggestions are good", on the questions as
suggested (S1–S7), and on the two choices made without a question (S8, S9).

| # | Decision |
|---|---|
| S1 | **Any player who has joined the game can create a group.** At most **10 groups per player**, owned or joined, and **50 members per group**, the size of the public board's top list |
| S2 | **An invite link is the only way in**, and the owner can renew it to shut out the old one. No typed code: it is the link in another shape. No invitation by name: it needs a search of nicknames, which shows every player's nickname to anyone searching |
| S3 | **A member leaves at any time. The owner renames the group, renews the link, removes a member and deletes the group.** When the owner leaves or deletes their account, the member who joined earliest becomes the owner; the last member leaving deletes the group. A removed member can rejoin with the same link until it is renewed |
| S4 | **A group's board ranks the same season balance as the public board**, members only, by specs/073's listing rule (S4 there). **No rewards or bonuses of a group's own**: the balance is the score everywhere, and a group bonus would let a player farm tokens by forming groups, and skew the public board |
| S5 | **A group sees nothing more of its members' guesses than the public board shows**: the shares after kickoff, no one's guess one by one. Each member's guess listed on the group's page after kickoff is a follow-up issue, if wanted |
| S6 | **A section `Ryhmät` on `/arvauspeli` after `Tulostaulukko`, a page per group at `/arvauspeli/ryhmat/{id}`, and an invite page at `/arvauspeli/liity/{token}`**, where a reader not yet a player joins the game and the group in one press, `Liity peliin ja ryhmään`. A non-member gets a 404 for a group's page |
| S7 | **A group's name is 3–30 characters under specs/077's character rules and word lists**; not unique, since only members see it |
| S8 | **No admin view of groups.** A group's name passes the word lists when saved, and only its members see it |
| S9 | **No nickname is required for a group.** A member without one is "Nimetön pelaaja", as specs/073's S2 |
| S10 | **The strings below are drafts, fine-tuned in implementation**, as specs/072's S20 |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (S10).

- **`Ryhmät`**, a section of `/arvauspeli` after `Tulostaulukko`, for a joined
  player, folding by its `h2` like the page's others, starting open: "Ryhmät
  ({n})".
  - A row per group the player belongs to: its name, linking to its page, the
    number of members, and the player's rank in it: "{name} · {m} jäsentä ·
    sijasi {r}.". With no guess yet this season, "ei vielä sijaa".
  - None: "Et kuulu vielä yhteenkään ryhmään. Perusta ryhmä ja kutsu kaverisi
    mukaan linkillä."
  - A field `Ryhmän nimi` and the button `Perusta ryhmä`. At the limit (S1) the
    form is replaced with "Voit kuulua enintään 10 ryhmään."
  - A failed read: "Ryhmien lataaminen epäonnistui. Yritä myöhemmin
    uudelleen."; the rest of the page is shown.
- **The group's page**, `/arvauspeli/ryhmat/{id}`, for its members only:
  - The group's name as the `h1`, and "{m} jäsentä · omistaja {nickname}".
  - Its leaderboard, as specs/073's `Tulostaulukko` table: `Sija`, `Pelaaja`,
    `Pelimerkit`, `Ratkaistut`, the player's own row bold with "(sinä)". Under
    it, when some members have no guess this season: "{k} jäsentä ei ole vielä
    arvannut tällä kaudella."
  - `Kutsulinkki`: the link, a button `Kopioi linkki`, and "Kuka tahansa
    linkin saanut kirjautunut käyttäjä voi liittyä ryhmään." For the owner
    also `Uusi linkki`, confirmed with "Vanha linkki lakkaa toimimasta.
    Jatketaanko?".
  - For a member: `Poistu ryhmästä`, confirmed with "Poistutaanko ryhmästä
    {name}?". For the owner, when other members remain: "Omistajuus siirtyy
    ryhmän pisimpään jäsenenä olleelle."
  - `Jäsenet`: every member by when they joined, the reader "(sinä)" and the
    owner "· omistaja" after the name.
  - For the owner: renaming under "Nimeä ryhmä uudelleen" (the field `Ryhmän
    nimi` and `Tallenna nimi`), confirmed with "Muutetaanko ryhmän nimeksi
    {name}?", a
    `Poista ryhmästä` on each other member's row under `Jäsenet`, confirmed
    with "Poistetaanko {nickname} ryhmästä?", and `Poista ryhmä`, confirmed
    with "Poistetaanko ryhmä {name}? Ryhmän tulostaulukko katoaa, pelimerkit
    eivät."
  - Before any season is stored, in place of the board: "Kausi ei ole vielä
    alkanut."
  - Copying: "Linkki kopioitu.", or "Kopiointi epäonnistui. Kopioi linkki yllä
    olevasta tekstistä."; a confirmation's other button is `Peruuta`; at the
    foot, "Takaisin arvauspeliin" linking to `/arvauspeli`.
  - Not a member, or no such group: the site's 404, so a group's existence is
    not revealed. Signed out: "Kirjaudu sisään nähdäksesi ryhmän." and the
    sign-in button, for any id alike.
  - A failed read: "Ryhmän lataaminen epäonnistui. Yritä myöhemmin uudelleen."
- **The invite page**, `/arvauspeli/liity/{token}`:
  - Signed out: "Kirjaudu sisään liittyäksesi ryhmään {name}." and the sign-in
    button, which returns to this page.
  - Signed in, a player: "Sinut on kutsuttu ryhmään {name} ({m} jäsentä)." and
    `Liity ryhmään`.
  - Signed in, not yet a player: the same line and `Liity peliin ja ryhmään`,
    with specs/072's join text, so joining the game stays a choice of its own
    (072's S1).
  - Already a member: straight to the group's page.
  - A link renewed, a group deleted, or no such link: "Kutsulinkki ei ole
    voimassa. Pyydä ryhmän jäseneltä uusi linkki." No group's name is shown.
  - Refusals: "Ryhmä on täynnä (50 jäsentä)." and "Voit kuulua enintään 10
    ryhmään."
  - A failed read: "Kutsun lataaminen epäonnistui. Yritä myöhemmin uudelleen."
- **The group's name, refused:** "Ryhmän nimen pituus on 3–30 merkkiä.",
  "Ryhmän nimessä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _
  ja .", "Valitse ryhmälle toinen nimi." (the word list), "Ryhmän tallentaminen
  epäonnistui. Yritä uudelleen."
- **A member removed, or the group deleted,** sees nothing of it on
  `/arvauspeli` beyond the row being gone. No notice.
- **The privacy page:** in the list of stored data, "Arvauspelin ryhmät, joihin
  kuulut, ja niiden nimet. Ryhmän jäsenet näkevät toistensa nimimerkit ja
  pelimerkit ryhmän tulostaulukossa, ja kutsulinkin saanut näkee ryhmän nimen ja
  jäsenmäärän."; and "arvauspelin ryhmäjäsenyydet" in the list of what deleting
  the account removes.

## API & Data

- **Storage:** two new tables. A group: its name, its invite token, created at;
  its owner is not stored but is the member who joined earliest (S3). A
  membership: the group, the player, joined at; unique on the
  pair, cascading on the group's deletion and on the player's (`game_player`).
  The shape is the implementation's (decisions/078). One migration,
  `create_game_group`.
- **The invite token:** 32 random bytes, base64url, unique. Renewing replaces
  it, so the old link stops working at once. It never goes to the logs.
- **The leaderboard** is specs/073's `readBoard`, restricted to the group's
  members: the same season, the same balance (the ledger's sum, bonuses and
  season guesses included), the same listing rule (at least one guess this
  season, 073's S4), the same ties. Nothing is written per group (S4).
- **The season** shown is the one the public board shows (072's S23). A group
  lasts across seasons; its board starts anew with each season's balances.
- **Writing:** server actions to create, rename, join, leave, remove a member,
  renew the link and delete, each checking the session, the membership and for
  the owner's actions the ownership on the server. The limits (S1) are checked
  in the same transaction as the write, under a lock on the group's row and the
  player's, so two joins at once cannot pass 50, nor one player's joins 10.
- **Ownership passing on** (S3): when the owner leaves or deletes their
  account, the member who joined earliest becomes the owner, in the same
  transaction; with no member left, the group is deleted.
- **The name:** normalised and checked as 077's nickname (NFKC, ends trimmed,
  spaces collapsed; its characters; its word lists), 3–30 characters; not
  unique (S7).
- **Reading:** stored rows only. No provider call.
- **Caching:** none. Each read is one grouped query over a group's members,
  read per request like the rest of `/arvauspeli`.

## Edge Cases

| Case | Behaviour |
|---|---|
| A player not yet joined to the game creates a group | Not offered: `Ryhmät` is for joined players (S1) |
| A reader not yet a player follows a link | `Liity peliin ja ryhmään` joins both in one press (S6) |
| A player already in the group follows its link | The group's page; nothing written |
| The 51st member, or a player's 11th group | Refused with its line (S1) |
| Two players joining the 50th place at once | One joins; the other is refused as full |
| An old link after `Uusi linkki` | "Kutsulinkki ei ole voimassa…" (S2) |
| A removed member follows the link again | Joins, unless the owner renewed it (S3) |
| The owner leaves | The earliest-joined remaining member owns it (S3) |
| The last member leaves | The group is deleted |
| The owner deletes their account | As the owner leaving |
| A member deletes their account | Gone from the group and its board |
| A member without a nickname | "Nimetön pelaaja", as 073's S2, and 077's line on `/arvauspeli` |
| A member who has not guessed this season | Not on the board; counted in the line under it (S4) |
| A member who joined the group mid-season | Ranked by their whole season balance, not from the day they joined (S4) |
| Between seasons | The board of the season the public board shows |
| Two groups with the same name | Allowed (S7) |
| A group's id in the URL, by a non-member | 404 |
| The owner removes themselves | Not offered: the owner leaves instead |
| A group deleted while a member has its page open | Their next action is refused with the 404; nothing else changes |

## Performance & Limits

- 10 groups per player, 50 members per group (S1). A group's board is
  specs/073's query restricted to at most 50 players.
- `Ryhmät` reads the player's groups, their sizes and the player's rank in each:
  at most 10 groups, one grouped query.

## Security & Secrets

No new variables or secrets. The invite token is unguessable (256 bits) and is
the only way in. Every read and write checks the session and the membership on
the server; a group's page and actions answer a non-member as a missing group.
Names and nicknames are rendered as text, never as HTML.

## Logging

- **Each write:** `info`, one line with the user id, the group id and the
  outcome: `Arvauspeli group created`, `renamed`, `joined`, `left`,
  `member removed` (with the removed member's id), `link renewed`, `deleted`,
  and `ownership passed` (with the new owner's id) when the owner leaves. An
  account's deletion passes ownership in the database, with no line of its own.
- **A refusal:** `info`, `Arvauspeli group refused`, with the user id, the
  group id when known, and the reason (`full`, `group-limit`, `name-length`,
  `name-characters`, `word-list`, `not-member`, `not-owner`, `invalid-link`,
  `not-player`, `self`).
- **A failed read or write:** `error`, with the user id and the group id.
- Ids only: no email address, account name, nickname, group name or token.

## Acceptance Criteria

- [ ] A joined player can create a group from `Ryhmät` on `/arvauspeli`, and becomes its owner
- [ ] A signed-in reader with the invite link can join the group, joining the game in the same press if not yet a player; a signed-out reader is returned to the link after signing in
- [ ] A renewed link refuses the old one with "Kutsulinkki ei ole voimassa…", showing no group name
- [ ] The group's page ranks its members with a guess this season by their season balance, the same figures as the public `Tulostaulukko`
- [ ] A non-member gets a 404 for a group's page
- [ ] A 51st member and a player's 11th group are refused
- [ ] A member can leave; when the owner leaves, the earliest-joined member becomes the owner; when the last member leaves, the group is gone
- [ ] The owner can rename the group, remove a member and delete the group, each after a confirmation
- [ ] A group name outside 3–30 characters, with a character outside 077's rules, or with a word on its lists, is refused
- [ ] Deleting the account removes the user's memberships, and passes on a group they owned
- [ ] The privacy page names the groups and who sees them

## Tests Required

- `tests/unit/lib/guessing-game-group.test.ts`: the name rules at 2, 3, 30 and
  31 characters, a refused character, a listed word; who becomes the owner.
- `tests/unit/lib/guessing-game-group-actions.test.ts`: each action's refusal
  and log line; no session; a non-member; a non-owner on each owner's action.
- `tests/unit/components/guessing-game-page.test.tsx` and the group's and the
  invite page's tests: each state above.
- `tests/integration/guessing-game-group.test.ts`: the board restricted to
  members, matching the public board's figures; two joins racing for the 50th
  place; ownership passing on leaving and on account deletion; the group
  deleted with its last member; a renewed token refusing the old one.
- `tests/e2e/guessing-game-group.spec.ts`: create a group, open its link as a
  second user, join, see both on its board, leave; on an empty `_test` database
  as well.

## Files To Update

- `specs/078-private-groups.md`
- `src/db/schema.ts` and the migration `create_game_group`
- `src/components/guessing-game-page.tsx`, and the new group and invite pages
- `src/lib/guessing-game-board.ts` (the board restricted to members)
- `src/app/privacy/page.tsx`
- `docs/infrastructure.md`, if anything there changes


## Open Questions

None.
