# 010 — Playoff group match list

## Summary

Render playoff-shaped groups (Veikkausliiga's Eurolopputurnaus and its
final) as a match list instead of a standings table, so knockout data is no
longer forced into a league-table shape that produces duplicate rows and
duplicate React keys.

## Scope

### In scope

- A new **playoff** group kind on `/kotimaa/sarjataulukko`, rendering the
  group's matches under its existing heading instead of a standings table.
- Classifying a group as playoff-shaped from TASO's own data, without a
  hand-maintained per-season list.
- Replacing the e2e assertion that currently encodes the duplicate rows as
  correct (`bonusRows).toHaveCount(6)` for 2022).

### Out of scope

- A real bracket / knockout visualisation — that is #68. When it lands,
  these groups should move from this flat match list to the bracket view.
- Any change to league groups (Runkosarja, Mestaruussarja,
  Haastajasarja/Karsintasarja): they keep their standings tables, their
  carry-over calculation, and their round selector.
- Surfacing the dateless aggregate rows — they are not real fixtures and
  must stay hidden (see Edge Cases).
- Adding the `spljp19` carry-over entry, which 2019's now-validated
  numbers warrant but which belongs to #127.
- The season-wide `/kotimaa/ottelut` list and the team page, which already
  show playoff matches like any other and need no change.

## UX / UI (Finnish strings)

On `/kotimaa/sarjataulukko?kilpailu=VL&kausi={season}`, a playoff-shaped
group renders as:

- The **same `<h2>` group heading** as today, from TASO's `group_name`
  (`Eurolopputurnaus`, `Eurolopputurnausfinaali`, `EL-lopputurnaus`,
  `EL-finaali`) via the existing `displayGroupName`. No new strings.
- Below it, the existing `MatchListTable` with its established Finnish
  headers — **`Pvm`**, **`Ottelu`**, **`Tulos`** — plus the fourth column
  **`Kierros`** showing the match's round number. `Kierros` rather than
  `Sarja`, because the group name is already the heading directly above.
- Team names link to `/kotimaa/joukkue/{id}?kilpailu={code}&kausi={season}`,
  exactly as the standings table's rows do today.
- A playoff group with no stored matches shows the existing empty-state
  string **`"Otteluita ei ole saatavilla."`**, matching the team page's
  empty state.

No standings table, no legend rows, and no round selector entry for these
groups. `StandingsLegend` continues to render once per page as today — it
explains the league tables, which are still present in every affected
season.

## API & Data

**No new endpoints and no new requests.** Both TASO calls already made by
this page are unchanged: `getMatches` (the group's matches, already stored
in `taso_matches`) and `getGroups` (already fetched whenever a season has
any non-own-calculated group).

**Classification rule.** A group is playoff-shaped when TASO's `getGroups`
returns **no points value** for *every* team in it.

Note that TASO **omits the `points` field entirely** on these rows rather
than sending `null` — the key is simply absent from the JSON object, so a
strict `=== null` test matches nothing. The check must accept both absent
and `null`. Every league group, in every season, has a real numeric
`points` for every team, so the two cases never overlap.

Verified live against all twelve seasons (2015–2026). This rule selects
exactly six groups and never a league group:

| Season | Group | Name | Slot rows | Distinct teams |
|---|---|---|---|---|
| 2019 | 4 | EL-lopputurnaus | 6 | 4 |
| 2019 | 5 | EL-finaali | 2 | 2 |
| 2022 | 4 | Eurolopputurnaus | 6 | 4 |
| 2022 | 5 | Eurolopputurnausfinaali | 2 | 2 |
| 2023 | 4 | Eurolopputurnaus | 8 | 5 |
| 2024 | 4 | Eurolopputurnaus | 8 | 5 |

Two rejected alternatives, both recorded so they are not re-proposed:

- **A hand-maintained config**, like `CARRY_OVER_CONFIG`. Rejected: it
  needs a manual entry every time a season adds such a group, which is the
  same maintenance trap as `LATEST_TASO_SEASON` (#124).
- **"Playoff = any group that is not own-calculated"**, i.e. the complement
  of the existing classification. Rejected because it depends on
  `CARRY_OVER_CONFIG` being complete, and it is not: **2019's
  Mestaruussarja and Haastajasarja are league groups with real points
  currently rendered pass-through**, because there is no `spljp19` entry.
  Under the complement rule they would wrongly lose their tables today.

  That specific gap should be closed on its own merits — 2019's carry-over
  has since been validated against live data (22 Runkosarja + 5 split
  matches, 27 played; all 12 teams' points reproduced exactly, zero
  mismatches), so a `spljp19: { 2: 1, 3: 1 }` entry is warranted and is
  tracked in #127. But the classification rule must not *depend* on that
  work, or on the config being complete in future: a season that splits
  and is added without its carry-over entry would silently turn two league
  groups into match lists. A positive test on the data cannot fail that
  way, which is why it is the rule even once 2019 is configured.

So a season's groups fall into three kinds, not two:

| Kind | Rule | Renders as |
|---|---|---|
| own-calculated | origin group, or has a carry-over entry | standings table + round selector |
| pass-through | has real points, not own-calculated | standings table, no round selector |
| **playoff** (new) | every team's `points` is `null` | **match list** |

**Caching**: unchanged. `getGroups` keeps the existing group cache and TTL
(`15 * 60` seconds for the current season, effectively permanent for a
completed one); matches keep `taso_matches` and its existing refresh rule.

**Match ordering**: chronological by `kickoffAt` ascending, matching every
other match list in the app. On the affected seasons this also happens to
be knockout-round order.

## Edge Cases

- **A team appearing in several bracket slots** — the case that motivates
  this spec. With no table there are no per-team rows and no key collision;
  a team simply appears in each match it played.
- **A playoff group whose `getGroups` entry is missing entirely.** Today
  this renders an empty table. Under this spec the match list is built from
  stored matches, which do exist, so the group renders correctly. But the
  classification rule reads `getGroups` — with no entry, the group is *not*
  classified as playoff and falls back to pass-through, i.e. today's empty
  table. Accepted: it does not occur in any of the twelve seasons, and
  failing to today's behaviour is not a regression.
- **A two-team final group** (2019 g5, 2022 g5) has no duplicate rows, so
  it is not broken today. It is still classified playoff and still renders
  as a match list, because it is the same kind of competition and an
  inconsistent rendering between a semi-final group and its final would be
  worse than the cosmetic change.
- **Aggregate rows must stay hidden, and already are.** Every two-legged
  playoff final carries a third row holding the tie's aggregate score,
  which is not a real fixture and must not appear as one. TASO marks it by
  leaving `date` and `time` empty; it is skipped at normalization and never
  stored, because `taso_matches.kickoff_at` is `NOT NULL`. Confirmed live —
  one such row per final, in all four seasons, always exactly the sum of
  the two legs:

  | Season | Leg 1 | Leg 2 | Aggregate row |
  |---|---|---|---|
  | 2019 | Mariehamn–Honka 1–2 | Honka–Mariehamn 1–0 | Honka–Mariehamn 3–1 |
  | 2022 | VPS–Haka 0–3 | Haka–VPS 1–2 | Haka–VPS 4–2 |
  | 2023 | Honka–VPS 0–1 | VPS–Honka 1–0 | VPS–Honka 2–0 |
  | 2024 | Haka–SJK 1–2 | SJK–Haka 2–2 | SJK–Haka 4–3 |

  So the existing skip is correct behaviour rather than a lucky accident,
  and this spec keeps it. A playoff match list shows only the real legs.
  Note this is the *only* thing distinguishing an aggregate row: it is
  `status: "Played"` with a real score like any other, so were
  `kickoff_at` ever made nullable, these rows would need excluding
  explicitly.
- **An unplayed playoff fixture** renders with the existing
  `formatMatchResult` "not yet played" output, exactly as in `/ottelut`.
- **A season with no playoff group at all** (2015–2018, 2020, 2021, 2025,
  2026) is completely unaffected.
- **Round selector**: playoff groups are already excluded, because
  `listSelectableTasoRounds` lists only own-calculated groups' rounds. This
  spec must preserve that; a playoff group's `round_id` values must not
  leak into the selector.

## Performance & Limits

No additional TASO requests, no additional database queries. The group's
matches are already loaded for the page (the standings page already calls
`getSeasonMatchList` to build the round list), and `getSeasonStandings` is
already wrapped in React's `cache()` per request.

Rendering a match list instead of a table is a small net reduction in
markup for these groups — at most 8 matches per group in any observed
season.

## Security & Secrets

No change. `TASO_API_KEY` remains the only secret involved, read from the
environment as today and not committed. No new env vars, so `.env.example`
is unchanged.

## Acceptance Criteria

- [ ] A playoff-shaped group renders its matches under its `group_name`
      heading, with `Pvm`/`Ottelu`/`Tulos`/`Kierros` columns and no
      standings table.
- [ ] No duplicate React keys are produced on `/kotimaa/sarjataulukko` for
      **2019, 2022, 2023, or 2024** — the four seasons with playoff groups.
- [ ] 2019's Mestaruussarja and Haastajasarja still render as standings
      tables with real points, and are *not* reclassified as playoff.
- [ ] League groups in every season keep their standings table, and
      own-calculated ones keep their round selector.
- [ ] A playoff group's rounds do not appear in the `Kierros` selector.
- [ ] Team names in a playoff match list link to the team page for the same
      competition and season.
- [ ] All new user-facing strings are Finnish; no new string is introduced
      beyond the existing shared ones.

## Tests Required

- `tests/unit/lib/taso-standings-service.test.ts`
  - a group whose every team has `points: null` is classified `playoff`;
  - a group with real points and no carry-over entry stays `pass-through`
    (the 2019 Mestaruussarja case, asserted explicitly);
  - an origin group stays `own-calculated`;
  - a playoff group's matches come back chronologically;
  - `listSelectableTasoRounds` still excludes a playoff group's rounds.
- `tests/unit/app/kotimaa/sarjataulukko/page.test.tsx`
  - a playoff group renders a match list and no `StandingsTable`;
  - a league group in the same season still renders a `StandingsTable`;
  - a playoff group with no matches renders `"Otteluita ei ole saatavilla."`.
- `tests/e2e/kotimaa-standings.spec.ts`
  - **replace** the existing 2022 assertion `bonusRows).toHaveCount(6)`,
    which asserts the duplicated slot count, with an assertion that the
    group renders a match list;
  - 2023 renders without a duplicate-key console error, and shows the five
    stored Eurolopputurnaus matches;
  - 2019 renders five groups: three tables plus two playoff match lists.

## Files To Update

- `src/lib/taso-standings-service.ts` — the new `playoff` group kind and
  its classification; the group's matches on the result.
- `src/app/kotimaa/standings/page.tsx` — render a `MatchListTable` for a
  playoff group instead of a `StandingsTable`.
- `specs/010-playoff-group-match-list.md` — this file.
- `decisions/010-playoff-group-match-list.md` — written by the implementing
  agent, not the spec author.
- Test files listed under Tests Required.
- No change to `.env.example`, `docs/setup/`, or the database schema.

## Open Questions

None outstanding. Two questions raised while drafting were resolved against
live data before this spec was confirmed, and are recorded above rather
than left implicit:

1. **The dateless played matches are aggregate rows** for two-legged
   finals, confirmed in all four seasons by checking each against the sum
   of its legs. They must not be shown, and the existing skip already
   hides them — see Edge Cases.
2. **2019's split groups do carry over**, validated exactly (12/12 teams,
   both groups). Adding the `spljp19` entry is real work, but it belongs to
   #127 rather than here, and this spec's classification rule is
   deliberately independent of it — see API & Data.
