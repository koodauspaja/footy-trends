# 715 — A match list's matchup links to the match where its names are plain: decisions

Chore #715. In a match list only the date linked to the match page, while the
matchup (`HJK – KuPS`) is what a reader reads and aims for. Agreed with Miikka
on 2026-10-23, and written on the issue.

| Decision | Why |
|---|---|
| The matchup links to the match exactly when `MatchListTable` gets `teamHref: null` and a `matchHref`. That is the team pages' `Ottelut`, Huuhkajat' and Helmarit's years, head-to-head's `Kohtaamiset` and a match page's `Aiemmat kohtaamiset` | Those lists show the names as plain text, so the matchup is free to be the link. One condition in the shared table covers all four, and a new list gets it by passing the same props |
| Lists that link each name to its team page keep those links: the domestic standings' match lists, `/kotimaa/ottelut`, and the foreign and national `/ottelut` | Agreed over making the matchup the match link everywhere. A cell cannot be one link and two team links at once |
| The date keeps its link | The issue asked for the matchup "also" to link. Every caller was checked on 2026-10-23: each passes a `matchHref`, so no list is left with neither |
