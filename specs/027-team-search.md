# 027 — Team search

## Summary

A signed-in reader types part of a team's name into the site header and lands on
that team's page, instead of having to remember which competition and season it
played in. Implements #247.

## Scope

### In scope
- A search field in the site header, offered only to a signed-in reader.
- Substring matching on team name, case-insensitive, folding Finnish `ä ö å`.
- Results naming the team, the competition it most recently played in, and that
  season, so two teams sharing a name can be told apart.
- Selecting a result opens that team's page.
- A Finnish empty state when nothing matches.

### Out of scope
- Searching anything but teams — no competitions, matches or players.
- Fuzzy matching, typo tolerance, relevance ranking, search-as-you-type.
- Saved or recent searches, and anything persisted per reader (#117 territory).
- A public, signed-out search.
- Keyboard-driven result navigation beyond what a native `<ul>` of links gives.

## UX / UI (Finnish strings)

Everything below lives in `src/components/team-search.tsx`, rendered by
`site-header.tsx` beside `AuthControls`.

**Layout: its own full-width row on small screens, inline from `sm` up.**
`w-full sm:w-auto` on the field's wrapper, inside the header's existing
`flex-wrap` row — no breakpoint JavaScript and no second component.

The alternative considered was a compact icon that expands on tap. Rejected: it
buys about 40px of vertical space and costs an open/closed state, focus
management on expand, an Escape-to-close handler, and an `aria-expanded`
relationship to get right — for the feature's *primary* control, on the screens
where typing is already hardest. The row only appears for a signed-in reader, so
a signed-out visitor sees today's header unchanged.

| Where | String |
|---|---|
| Field label (visually hidden) | `Hae joukkuetta` |
| Field placeholder | `Hae joukkuetta` |
| Submit button label | `Hae` |
| Empty state | `Ei hakutuloksia.` |
| Term too short | `Kirjoita vähintään kaksi merkkiä.` |
| Search failed | `Haku epäonnistui. Yritä uudelleen.` |
| Result row, secondary line | `{competition} · {season}` — e.g. `Kolmonen · 2025` |
| Result list landmark | `aria-label="Hakutulokset"` |
| Busy state | the field's `aria-busy`, no separate string |

A result row shows the team's **current** name as its primary line. When a team
has no resolvable competition or season the secondary line is omitted rather
than filled with a placeholder.

**No region field on the row.** Teams sharing a name across regions are unlikely,
and where it happens the **competition name already says the region** —
`Kolmonen` is domestic in a way `Mestarien liiga` is not. A third field would
repeat what the second already carries, on every row, to disambiguate a case
that may not exist.

One consequence worth stating, because it will otherwise read as a bug: **the
same real club can legitimately appear twice**, once from TASO and once from
football-data, under different provider ids and leading to different pages. Both
rows are correct — they are the club as each provider knows it — and the
competition line is what tells them apart.

## API & Data

### Where teams come from

There is no `teams` table. A team is a `(source, teamProviderId)` pair appearing
in `matches` (football-data) and `taso_matches` (TASO), each row carrying the
name **as recorded at the time**.

### The two steps, deliberately separate

1. **Find matching ids.** Match the folded search term against the folded
   `home_team_name` and `away_team_name` of both tables, returning distinct
   `(source, teamProviderId)` pairs.
2. **Resolve what to display.** Feed those pairs to the existing
   `resolveTeamNames` in `src/lib/favourites.ts`, which already answers "what is
   this team called now, and where does its page live" from the newest stored
   match per id.

Separating them is what makes renames behave correctly. A club that was renamed
is **found by any name it has ever carried**, because step 1 searches every
stored row — and is **displayed under its current name**, because step 2 reads
only the newest row. Collapsing the two would return the old name whenever an
old name matched.

`resolveTeamNames` gains `seasonId` alongside the name and region; the newest
match already supplies it, so this is one more column on a query that runs
regardless.

### Folding

```sql
translate(lower(name), 'äöåÄÖÅ', 'aoaAOA')
```

Applied to **both** the stored name and the search term, which is what makes the
matching symmetric: `jarvenpaa` finds `Järvenpää` and `HÄRMÄ` finds `Härmä`.

`translate` is `IMMUTABLE` (`pg_proc.provolatile = 'i'`, verified), so it can
carry an expression index. `unaccent` was rejected deliberately: it is available
but **not installed** on the local Postgres 18 image, so it would need a
`CREATE EXTENSION` migration and the privilege to run it on Railway — a
dependency on the platform for a fold that three characters describe completely.

### Transport

A server action in `src/lib/team-search-actions.ts`, following
`favourite-actions.ts`:

```ts
export async function searchTeamsAction(term: string): Promise<SearchResult>;

type SearchResult =
  | { ok: true; teams: TeamSearchView[] }
  | { ok: false; reason: "unauthenticated" | "too-short" | "failed" };
```

**The action re-checks the session.** Hiding the field from a signed-out reader
is a UX decision; the gate is server-side, via `currentUserId()` from
`src/lib/current-user.ts` — the lazy-import module that exists so a `"use server"`
file does not drag better-auth into a client bundle (#182, #306).

### Caching

None. Results are derived from stored rows that a refresh can change, the
result set is per-term rather than per-page, and the query is bounded (below).
`revalidatePath` is not involved: nothing is being written.

## Edge Cases

| Case | Behaviour |
|---|---|
| Term shorter than 2 characters after trimming | `{ ok: false, reason: "too-short" }`; the field shows `Kirjoita vähintään kaksi merkkiä.` and no query runs |
| Term is only whitespace | Treated as too short |
| Signed-out reader | The component renders `null`; the action refuses with `unauthenticated` |
| No matches | `{ ok: true, teams: [] }`; the field shows `Ei hakutuloksia.` |
| Team id `0` | Excluded. TASO's unresolved-bracket placeholder, 22 rows measured 2026-09-02, already filtered on the match page by spec 019 |
| Empty team name | Excluded. One exists in TASO |
| Two teams with the same name | Both returned, distinguished by competition and season. `FC Honka`, `PK-35` and `TiPS` each carry nine distinct ids |
| A team with no resolvable region | Returned, but not a link — the same treatment `/suosikit` gives it. In practice this is every **TASO national side**: `/maajoukkueet/joukkue/[id]` is football-data's page and TASO ids are a different id space, so a link there would 404 or show a different team. Finland is the one that deserves better and is filed as #325 |
| A renamed club | Found by any past name, shown under the current one |
| `%` or `_` in the term | Escaped before it reaches `LIKE`, or the reader can match everything with one character |
| Provider or database error | `{ ok: false, reason: "failed" }`; the field shows `Haku epäonnistui. Yritä uudelleen.` |

## Performance & Limits

- **At most 20 results**, ordered by the team's most recent match, newest first.
  Confirmed with Miikka rather than assumed. A reader who cannot find their team
  in twenty should type more, and the cap bounds both the query and the payload.
  `FC Honka` alone carries nine ids, so a common club name can fill half a page
  on its own — which is an argument for the cap, not against it.
- **Minimum term length 2**, so a single keystroke cannot scan every row.
- **Four expression indexes**, one per searched column:

  ```sql
  create index matches_home_team_name_folded_idx
    on matches (translate(lower(home_team_name), 'äöåÄÖÅ', 'aoaAOA'));
  ```

  and the same for `matches.away_team_name`, `taso_matches.home_team_name`,
  `taso_matches.away_team_name`.

  **A leading-wildcard `LIKE '%term%'` cannot use a B-tree index**, so these help
  only exact and prefix matching. They are specified anyway because they are
  cheap, and because the implementation must **measure** the substring query
  against production-scale data before deciding whether `pg_trgm` with a GIN
  index is warranted. ~1,630 teams is small; the match tables it derives them
  from are not, and that is the number that matters.

- **The implementing agent must record the measured query time** in
  `decisions/027-team-search.md`, against a database with production-scale
  match rows. If a substring search exceeds ~200 ms, stop and reconsider before
  shipping: a materialised team table, or `pg_trgm`, are the two candidates.

## Security & Secrets

- **No new environment variables and no secrets.**
- The search term is user input reaching SQL: it must be a **bound parameter**,
  never interpolated. Drizzle's `sql` template does this; `sql.raw` must not
  appear anywhere in this feature.
- `%` and `_` are escaped so a reader cannot turn the query into a full scan.
- The action authorises server-side rather than trusting the hidden field.
- Results expose only what a signed-in reader can already reach by browsing:
  team names, competitions, seasons. No addresses, no user data.

## Acceptance Criteria

- [ ] A signed-in reader can search teams by name from a field in the site header
- [ ] A signed-out reader is not offered the search at all — no empty field, and
      no field that rejects them on submit
- [ ] Matching is case-insensitive and matches a substring, so `honka` finds
      `FC Honka`
- [ ] Finnish characters match their plain forms in both directions —
      `jarvenpaa` finds `Järvenpää`, `HÄRMÄ` finds `Härmä`
- [ ] Each result names the team, the competition it most recently played in,
      and that season
- [ ] Two teams sharing a name are both returned and distinguishable
- [ ] Selecting a result opens that team's page
- [ ] A search with no matches shows `Ei hakutuloksia.`
- [ ] Team id `0` and empty team names never appear in results
- [ ] A renamed club is found by a former name and displayed under its current one
- [ ] The action refuses a signed-out caller, independently of the UI
- [ ] All user-facing strings are Finnish
- [ ] `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` are still prerendered —
      `tests/unit/app/rendering-mode.test.ts` passes unchanged

## Tests Required

| File | Asserts |
|---|---|
| `tests/unit/lib/team-search.test.ts` | folding both directions; the 2-character minimum; `%`/`_` escaping; id `0` and empty names excluded; the 20 cap |
| `tests/unit/lib/team-search-actions.test.ts` | refuses a signed-out caller; maps a thrown error to `failed`; returns `too-short` without querying |
| `tests/unit/components/team-search.test.tsx` | renders nothing signed out; empty state; error state; too-short message; a result links to the team page; two same-named teams are distinguishable. **Must mock `@/lib/auth-client`** — see the note in `favourite-toggle.tsx` |
| `tests/integration/team-search.test.ts` | against a real database: a renamed club found by its old name and shown under the new one; a substring match across both providers; ordering newest-first |
| `tests/e2e/team-search.spec.ts` | the field is absent signed out. The signed-in path cannot be exercised — the suite cannot forge a session, the same limit `favourite-actions.ts` records |
| `tests/unit/app/rendering-mode.test.ts` | unchanged and passing — the four prerendered pages must stay prerendered |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/027-team-search.md` — this file
- `src/lib/team-search.ts` — matching and folding, no session
- `src/lib/team-search-actions.ts` — the `"use server"` boundary
- `src/lib/favourites.ts` — `resolveTeamNames` also returns `seasonId`
- `src/components/team-search.tsx` — the field, results and states
- `src/components/site-header.tsx` — renders it
- `drizzle/` — one migration adding the four expression indexes
- `decisions/027-team-search.md` — by the implementing agent, and it must carry
  the measured query time

No `.env.example` or `docs/setup/` change: no new configuration.

## Open Questions

None outstanding. The three the spec was drafted with were settled with Miikka
on 2026-09-10 and folded into the sections above:

| Question | Answer |
|---|---|
| The field's layout on mobile | Its own full-width row, not an expanding icon — see *UX / UI* for what that trades away |
| A region field on each result row | No. The competition name already carries the region, and same-name-across-regions is unlikely |
| Is 20 the right cap | Yes |

Two things are deliberately **decided but unmeasured**, and both are the
implementer's to confirm rather than the spec's to assert:

- **Whether a substring `LIKE` is fast enough at production scale.** The local
  database holds 449 match rows and no football-data rows, so nothing measured
  here would mean anything. *Performance & Limits* names the threshold, the two
  fallbacks, and requires the number in the decision record.
- **Whether any two teams genuinely share a name across regions.** If one turns
  up, the competition line distinguishes it and no change is needed; the row was
  designed so that finding out costs nothing.
