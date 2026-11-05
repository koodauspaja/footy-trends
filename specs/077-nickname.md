# 077 — A nickname the user sets up and edits

## Summary

A signed-in user sets up a nickname of their own on `/asetukset` and can change
it at any time. `Arvauspeli`'s leaderboard (073) shows players by it, never by
the account's name, which is the Google real name. Released with 073 (#748).

## Scope

### In scope

- **Setting up, changing and removing a nickname** on `/asetukset` (S1, S4, S9).
- **Its rules**: length, characters, uniqueness ignoring case (S3).
- **A word list** that refuses an offensive nickname (S6).
- **The admin clearing a nickname** from the user table (S7).
- **A line on `/arvauspeli`** for a player without one, linking to
  `/asetukset` (S1).
- The privacy page names the nickname and who sees it (S8).

### Out of scope

- **The leaderboard** that shows it: 073 (#757).
- Showing the nickname anywhere else, the account menu included (S2).
- Requiring a nickname to join or play (S5).
- A history of earlier nicknames, or a limit on how often it changes (S4).
- Matching inflected or compound forms of a listed word, or look-alike
  spellings such as digits for letters (S6).

## Settled decisions

| # | Decision | Source |
|---|---|---|
| S1 | **Set up and changed on `/asetukset`, the one place.** `/arvauspeli` tells a player without a nickname where to set one | Miikka, 2026-11-05: "good", on Q1 |
| S2 | **Site-wide, stored on the user, called `Nimimerkki`.** For now only the leaderboard shows it | Miikka, 2026-11-05: "good", on Q2 |
| S3 | **Rules:** 3–20 characters after trimming the ends and collapsing repeated spaces; Latin letters (`åäö` and other accented ones included), digits, spaces, `-`, `_` and `.`; unique ignoring case | Miikka, 2026-11-05: "good", on Q3. Latin letters only, so that a Cyrillic `а` cannot pass for an `a` beside a taken name |
| S4 | **Changed any time, as often as the user likes.** Anything showing it shows the current one | Miikka, 2026-11-05: "good", on Q4 |
| S5 | **Not required to play.** A player without one is "Nimetön pelaaja" on the leaderboard (073) | Miikka, 2026-11-05: "good", on Q5 |
| S6 | **The LDNOOBW Finnish and English lists, copied into the repository**, checked when a nickname is saved, by whole words, ignoring case. A match is refused with "Valitse toinen nimimerkki.", not naming the word. No web service | Miikka, 2026-11-05: "077 suggestion ok", and "good" on Q6 |
| S7 | **The admin's user table shows each nickname and has `Tyhjennä nimimerkki`**, with a confirmation. The user can then choose again | Miikka, 2026-11-05: "good", on Q7 |
| S8 | **The privacy page** names the nickname and says other signed-in users see it | Miikka, 2026-11-05: "good", on Q8 |
| S9 | **The user can remove their own nickname**: saving the field empty removes it | Miikka, 2026-11-05: "ok", on removing one's own |
| S11 | **The word lists' attribution is a note beside the copied files**, naming LDNOOBW, CC BY 4.0 and the commit they were copied at. Nothing on the terms page: the app never shows the lists | Miikka, 2026-11-05: "that's ok", on the attribution |
| S10 | **The strings below are drafts, fine-tuned in implementation** | As specs/072's S20 |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation (S10).

- **`/asetukset`**, a section `Nimimerkki` after `Profiilikuva`:
  - "Nimimerkki näkyy muille kirjautuneille käyttäjille arvauspelin
    tulostaulukossa."
  - A field labelled `Nimimerkki`, holding the current one, and the button
    `Tallenna`.
  - After a save: "Nimimerkki tallennettu.", or "Nimimerkki poistettu." for an
    empty field (S9).
  - Refusals, under the field: "Nimimerkin pituus on 3–20 merkkiä.",
    "Nimimerkissä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _
    ja .", "Nimimerkki on jo käytössä.", "Valitse toinen nimimerkki." (S6),
    "Nimimerkin tallentaminen epäonnistui. Yritä uudelleen."
  - A failed read costs the section, not the page: "Nimimerkkiä ei voitu
    ladata."
- **`/arvauspeli`**, a joined player without a nickname, under the balance:
  "Valitse [nimimerkki](/asetukset), jolla näyt tulostaulukossa."
- **Admin user table:** a column `Nimimerkki` (empty when none), and the action
  `Tyhjennä nimimerkki` on a row that has one, confirmed with "Tyhjennetäänkö
  käyttäjän {email} nimimerkki?". After it: "Nimimerkki tyhjennetty."
- **The privacy page:** "Nimimerkkisi, jos olet valinnut sellaisen. Muut
  kirjautuneet käyttäjät näkevät sen arvauspelin tulostaulukossa." in the list
  of stored data, and "nimimerkin" in the list of what deleting the account
  removes.

## API & Data

- **Storage:** a table of its own, one row per user, cascading on the user's
  deletion, with a unique index on the nickname ignoring case. Not a column on
  `user`, which better-auth rewrites on every sign-in (as `user_avatar`). The
  shape is the implementation's (decisions/077).
- **Writing:** a server action to save or remove the user's own nickname, and
  an admin action to clear anyone's. Both check the session (and the role) on
  the server, and apply S3 and S6 on the server whatever the browser sent. A
  name taken by another user is refused by the unique index, so two users
  saving the same name at once cannot both get it.
- **Normalising** before every check and before storing: Unicode NFC, ends
  trimmed, repeated spaces collapsed. Case is kept as typed and ignored only
  when comparing.
- **The word list:** LDNOOBW's `fi` (130 entries) and `en` (403), copied with
  the commit they were taken at. A nickname is split into words at every
  character that is not a letter or a digit, and refused when a listed entry,
  one word or several in a row, equals its words, ignoring case. The licence is
  CC BY 4.0; its attribution sits beside the copied files (S11).
- **Reading:** `/asetukset` and the admin table read the row. 073's
  leaderboard reads it. No provider call, no cache: it is one row per user.
- **Caching:** none.

## Edge Cases

| Case | Behaviour |
|---|---|
| `  Kalle   Kukko ` | Stored as `Kalle Kukko` |
| 2 or 21 characters after normalising | Refused: the length line |
| An emoji, `@`, `!`, or a Cyrillic letter | Refused: the characters line |
| `kalle` when another user has `Kalle` | Refused: "Nimimerkki on jo käytössä." |
| The user's own nickname in another case, `KALLE` for `Kalle` | Saved: the case changes |
| Two users saving the same name at once | One saves; the other is refused as taken |
| A listed word as a word of its own, `Iso_Paska` | Refused: "Valitse toinen nimimerkki." |
| A listed word inside a longer one, `Paskahousu`, or with a digit for a letter, `P4ska` | Saved (S6). The admin can clear it (S7) |
| An ordinary word that contains a listed one, `Scunthorpe` | Saved |
| The field saved empty | The nickname is removed (S9) |
| The admin clears a nickname | The name is free for anyone; the user sees the field empty |
| A user deletes their account | The row goes with it; the name is free |
| The row cannot be read on `/asetukset` | The section says so; the rest of the page works |

## Performance & Limits

One row per user, read by key, and checked against about 530 list entries on
save. No measurable load.

## Security & Secrets

No new variables or secrets. A user writes only their own nickname; clearing
another's is admin-only, checked on the server. The nickname is rendered as
text everywhere, never as HTML.

## Logging

- **Saved, changed or removed:** `info`, `Nickname saved` with the user id and
  the outcome (`set`, `changed`, `removed`), or `Nickname refused` with the
  reason (`length`, `characters`, `taken`, `word-list`). Never the nickname.
- **Cleared by the admin:** `info`, `Nickname cleared by admin`, the admin's id
  and the user's id.
- **A failed save or read:** `error`, with the user id.
- Ids only: no email address, account name or nickname.

## Acceptance Criteria

- [ ] A user can set, change and remove their nickname on `/asetukset`, and the field shows the current one
- [ ] A nickname is stored trimmed with its spaces collapsed, and one outside 3–20 characters is refused with "Nimimerkin pituus on 3–20 merkkiä."
- [ ] A nickname with a character outside S3 is refused, a Cyrillic letter included
- [ ] A nickname another user has, in any case, is refused with "Nimimerkki on jo käytössä."
- [ ] A nickname with a word on the Finnish or English list is refused with "Valitse toinen nimimerkki.", and one where it is only part of a longer word is saved
- [ ] A joined player without a nickname sees the line linking to `/asetukset` on `/arvauspeli`
- [ ] The admin's user table shows each nickname, and `Tyhjennä nimimerkki` clears one after the confirmation
- [ ] Deleting the account removes the nickname
- [ ] The privacy page names the nickname and that other signed-in users see it
- [ ] The copied word lists carry LDNOOBW's attribution and licence

## Tests Required

- `tests/unit/lib/nickname.test.ts`: normalising; the length at 2, 3, 20 and 21;
  every allowed character class and a refused one of each kind; a listed word
  alone, in a phrase entry, inside a longer word, and in another case.
- `tests/unit/lib/nickname-actions.test.ts`: each refusal and its log line; no
  session; the admin action refused for a non-admin.
- `tests/unit/components/settings-page.test.tsx` and
  `admin-user-table.test.tsx`: the section's states and the clear action.
- `tests/integration/nickname.test.ts`: two users racing for one name; a case
  change of one's own; the cascade on deletion.
- `tests/e2e/nickname.spec.ts`: set a nickname on `/asetukset`, see a refusal,
  change it, remove it; on an empty `_test` database as well.

## Files To Update

- `specs/077-nickname.md`
- `src/app/settings/page.tsx`, `src/components/settings-page.tsx`
- `src/components/admin-user-table.tsx`, and the admin's data and actions
- `src/components/guessing-game-page.tsx` (the line for a player without one)
- `src/app/privacy/page.tsx`
- `specs/073-leaderboard.md`: its strings say `pelinimi`; they become
  `nimimerkki` (S2)

## Open Questions

None.
