# 043 — Liigacup

## Summary

Add Liigacup — the Veikkausliiga-level league cup — to `/kotimaa`: its two
groups as standings tables and its semi-finals and final as a drawn bracket,
laid out the way Champions League is. Correct `specs/015-finnish-cups.md`,
which records Liigacup's absence as a decision that was never made (#474).

## Scope

### In scope

- A **`Liigacup`** entry in `DOMESTIC_COMPETITIONS` (`code: "LC"`,
  `format: "cup"`), after `Naisten Suomen Cup` and before `Ykkösliigacup`,
  seasons **2023 onward**.
- **Group tables in a cup.** A cup group that is a round-robin renders as a
  standings table again, as specs/015 specifies and as #272 stopped. Applies to
  every Finnish cup, not only Liigacup (see API & Data).
- **The `1-4` group as a bracket.** A knockout group holding semi-finals and
  final together is split into those two rounds and drawn. Applies to
  Ykkösliigacup too, whose `1-4` has the same format.
- **Champions League layout for a cup season with tables:** tables first,
  `Pudotuspelit` below them.
- **Cup classification keyed on the competition**, not the `category_id` —
  Liigacup's 2023 category is `LC2023`.
- The specs/015 Out of scope correction.

### Out of scope

- **Liigacup 2015.** TASO has it (`spljp15`/`LC`, 31 matches), but 2016–2022
  have none, and supporting a second `competition_id` scheme for one isolated
  season is not worth the plumbing. Left out on purpose (decided in chat
  2026-09-28); the registry comment records it so the next reader does not
  think it was missed.
- **Miesten/Naisten Regions Cup, Roots Cup, Kansallinen Cup** — the other three
  on specs/015's line; this spec leaves them excluded.
- Round-name normalisation, and specs/015's backwards walk for cups whose
  rounds are separate groups — unchanged.
- A cup season with **no** tables (most MSC and NSC seasons) — unchanged:
  bracket above the rounds, drawn rounds also listed, per specs/015.

## UX / UI (Finnish strings)

### Picker (`/kotimaa`)

**`Liigacup`**, after `Naisten Suomen Cup`, before `Ykkösliigacup` (tier
order; confirmed in chat 2026-09-28). Season pages show TASO's own
`category_name`, as every competition does.

### Season page — a cup season that has group tables

Liigacup, Ykkösliigacup, and any MSC/NSC season with a group stage (MSC 2018,
NSC 2020). Laid out as Champions League (specs/014):

1. **The groups**, each a `StandingsTable` under its `<h2>` (`Lohko A`,
   `Lohko B`), with `StandingsLegend` once below the last, as on a league page.
   No `Kierros` selector — a cup page has none (specs/015).
2. **`Pudotuspelit`** below the tables, as an `<h2>`:
   - knockout groups **not** drawn are listed first, each under its own `<h3>`
     as a match list — as CL lists its earlier rounds above the tree;
   - then the tree: `Välierät` → `Loppuottelu` for Liigacup and Ykkösliigacup,
     winner in bold, aggregate beside each team.

A drawn round is **not** also listed, as in CL. For Liigacup that means `1-4`
appears only as the tree: its three matches are the tree.

Why this differs from specs/015's bracket-on-top: specs/015 put the bracket
first *because* "a Finnish cup has no table for most seasons". A season that
does have tables is the CL case, and gets the CL answer.

Empty state where the tree exists but no tie is played:
**`Pudotuspelit eivät ole vielä alkaneet.`** (reused). No new strings.

### specs/015 correction

The Out of scope line loses Liigacup and gains:

> Liigacup was listed here in error; its exclusion was not decided. Added in
> specs/043-liigacup.md (#474).

Wording confirmed in chat 2026-09-28. specs/015's layout and table sections
also gain a pointer to this spec, since it changes both for seasons with group
tables.

### Where it appears

Everywhere a domestic competition does: picker, standings and match lists, team
pages, `Analyysit` on a cup team page (specs/040), head-to-head (specs/042).

## API & Data

### Where TASO publishes it — verified live 2026-09-28

Probed from local dev (the drafting session cannot reach TASO):

| Season | `competition_id` | `category_id` | Groups (matches) |
|---|---|---|---|
| 2015 | `spljp15` | `LC` | 5 groups, 31 — **out of scope** |
| 2016–2022 | — | — | none, under either scheme |
| 2023 | `Liigacup23` | `LC2023` | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| 2024–2026 | `Liigacup24`–`26` | `LC` | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| 2027 | `Liigacup27` | — | no categories yet |

```ts
// 2023 onward only. TASO also holds 2015 inside the spljp15 umbrella, but
// 2016-2022 exist under neither scheme; one isolated season was left out on
// purpose (specs/043). Probed: Liigacup15-22 and Liigacup27 return no
// categories.
{
  code: "LC",
  name: "Liigacup",
  categories: [
    { fromSeason: 2024, categoryId: "LC" },
    { fromSeason: 2023, categoryId: "LC2023" },
  ],
  competitionIdPrefix: "Liigacup",
  format: "cup",
}
```

Registry-only: `competitionIdForSeason` already takes a per-competition prefix
and `categoryIdForSeason` already resolves eras. Floor **2023**, and 2023–2026
is unbroken. `SEASON_COMPETITION_ID` (specs/011) is not relaxed; the current
season follows the umbrella's, as Ykkösliigacup's does.

### The format

Confirmed in chat 2026-09-28: two six-team round-robins; then **A1 v B2** and
**B1 v A2** as semi-finals; the winners meet in the final. TASO publishes the
semi-finals and final together as one group, `1-4`: 3 matches, 4 teams, and
one `getCategory` row per bracket slot (6). Ykkösliigacup has the same format.

### Cup classification must key on the competition

`buildGroup` (`src/lib/taso-standings-service.ts`) asks
`isDomesticCup(categoryId)` — a category id into a function that takes a
competition code. It works today only because every cup's category id equals its
code. `LC2023` does not, so 2023 would render as a league. Fixed by resolving
the category to its competition (`competitionCodeForCategory`) or passing the
code through.

### Which cup groups are tables

Today every group of a cup renders as a match list: `buildGroup` returns early
for a cup, before `keepsATable` is consulted. That was #272's fix — TASO's
`getCategory` sends `points` even for knockout rounds, so points could no
longer tell a round from a group. The cost was that real groups
(Ykkösliigacup's `Lohko A`/`B`, MSC 2018's `Lohko A–E`) lost their tables,
contradicting specs/015; its e2e test checks only headings, so nothing caught
it. Liigacup's groups would inherit the same.

Points cannot decide it, so structure does. A cup group is a **round-robin**,
and keeps a table, when:

- it has **at least 3 teams** in its matches, and
- **every pair** of those teams has at least one match in the group, played or
  scheduled.

Everything else in a cup is a knockout group. Checked against the known shapes:

| Group | Teams | Matches | Every pair? | Result |
|---|---|---|---|---|
| Liigacup `Lohko A` | 6 | 15 | yes | table |
| Liigacup / Ykkösliigacup `1-4` | 4 | 3 | no | knockout |
| MSC 2021 4-team groups | 4 | 6 | yes | table |
| An MSC knockout round | *n* | *n*/2 | no | knockout |
| A final | 2 | 1 | — (<3 teams) | knockout |

Teams are counted from the group's matches, not `getCategory`'s rows, which are
per slot for a knockout (the reason specs/015 already gives). Leagues are
untouched: they still go through `keepsATable` as today.

### Splitting a combined knockout group

specs/015's walk needs the final as its own 2-team group. `1-4` has none, so a
knockout group is split into rounds by its own structure first:

1. It qualifies when its matches involve exactly **4 teams** in exactly **3
   matches**, and the **last to kick off** is between the winners of the other
   two, winners from TASO's `winner`.
2. The two earlier matches become `Välierät`, the last `Loppuottelu`, and the
   walk then sees them as it sees MSC's separate rounds.
3. A group that does not qualify is left whole.

The split reads the matches, not group positions, so it does not depend on the
A1 v B2 pairing. The tree's semi-final order comes from specs/015's
`orderRoundsForTree`, which already places each semi-final beside the final it
feeds.

### Caching

Unchanged: `getMatches`, `getCategory`, `getCategories` per competition-season,
same keys and TTLs. The classification and split are computed per render from
data already loaded.

## Edge Cases

- **2023 under `LC2023`** — resolves to Liigacup, classifies as a cup.
- **A `1-4` not fully played** — the final is unknown or has no winner, so rule
  1 cannot confirm the shape; the group stays whole and is listed under
  `Pudotuspelit`. No tree from a guess. Once the final has a winner, it draws.
- **A group stage before every fixture is published** — a pair with no match
  yet makes a group look like a knockout. Liigacup and Ykkösliigacup publish
  the whole round-robin up front (15 fixtures, all present); a cup that did not
  would render a match list until its fixtures appear, and then a table. Noted
  so the behaviour is expected rather than surprising.
- **A level semi-final or final** — decided by TASO's `winner`, labelled
  `declared`, no `(rp)` (specs/015).
- **A third-place match in a `1-4`-shaped group** — last match between the
  semi losers, fails rule 1, stays a list.
- **A cup season with no tables** — unchanged from specs/015.
- **`Liigacup27`** — offered once 2027 is current; empty state until TASO
  publishes it, as for `M1LCUP27`.
- **`kausi=2015` typed into the URL** — below the floor, handled as for every
  competition.

## Performance & Limits

- No new requests per page. The backfill and refreshes gain one competition:
  four seasons, three calls each.
- The round-robin check is O(m) over a group's matches; the split looks at three.

## Security & Secrets

- No new environment variables; `TASO_API_KEY` exists.
- `kilpailu` validated against the registry before any URL, cache key or query;
  `competitionIdPrefix` is a registry constant.
- No secrets committed.

## Acceptance Criteria

- [ ] `/kotimaa` lists `Liigacup` after `Naisten Suomen Cup` and before
      `Ykkösliigacup`.
- [ ] Liigacup's season selector offers 2023–2026 and nothing earlier.
- [ ] Liigacup 2026 shows `Lohko A` and `Lohko B` as standings tables, then
      `Pudotuspelit` below them with `Välierät` (2 ties) → `Loppuottelu` (1
      tie), the final's winner in bold as TASO records it.
- [ ] Each semi-final in the tree is the one that fed its finalist, A1 v B2 and
      B1 v A2.
- [ ] `1-4` does not appear as a separate list when it is drawn.
- [ ] Liigacup 2023, read from `LC2023`, renders exactly as 2026 does.
- [ ] Ykkösliigacup 2026 shows `Lohko A`/`Lohko B` as tables and its `1-4` as a
      `Välierät` → `Loppuottelu` tree below them.
- [ ] MSC 2018 shows `Lohko A`–`Lohko E` as tables, and its knockout rounds
      under `Pudotuspelit` below them.
- [ ] MSC 2025 (no group stage) is unchanged: bracket above the rounds, drawn
      rounds also listed.
- [ ] League competitions are unchanged.
- [ ] `npm run backfill` stores Liigacup 2023–2026 — `Liigacup23`/`LC2023`,
      `Liigacup24`–`26`/`LC` — and a re-run skips them.
- [ ] A team page reached from Liigacup loads, its `Analyysit` as a cup team
      page (specs/040).
- [ ] Head-to-head (specs/042) between two Veikkausliiga clubs includes their
      Liigacup meetings once stored.
- [ ] specs/015 carries the agreed correction and the pointers here.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/domestic-competitions.test.ts`
  - `LC` exists, `format: "cup"`, immediately before `M1LCUP`.
  - `competitionIdForSeason("LC", 2023)` → `Liigacup23`; 2026 → `Liigacup26`.
  - `categoryIdForSeason("LC", …)`: 2023 → `LC2023`; 2024, 2026 → `LC`.
  - `earliestSeasonFor("LC")` → 2023.
  - `competitionCodeForCategory` maps `LC` and `LC2023` to `LC`.
- `tests/unit/lib/cup-rounds.test.ts`
  - Round-robin check: 6 teams / 15 matches → table; 4 / 6 → table; 4 / 3 →
    knockout; 2 / 1 → knockout; *n* / *n*/2 → knockout; a round-robin with one
    fixture missing → knockout.
  - Split: qualifying `1-4` → `Välierät` (2) + `Loppuottelu` (1); final between
    semi losers → not split; final without a winner → not split; 3 teams or 4
    matches → not split; a level semi decided by `winner` → that team is the
    finalist.
  - MSC/NSC shapes from specs/015's tests → unchanged.
- `tests/unit/lib/taso-standings-service.test.ts`
  - A group under `LC2023` is classified as a cup group.
  - A cup's round-robin group builds a table; its knockout group a match list.
- `tests/unit/app/domestic/standings/page.test.tsx`
  - Liigacup-shaped season: two tables, then `Pudotuspelit` with a two-column
    tree, no `1-4` list.
  - MSC 2025-shaped season: unchanged layout.
- `tests/e2e/cup-domestic.spec.ts`
  - `?kilpailu=LC&kausi=2026`: `Lohko A`/`Lohko B` are tables (assert a table
    role, not only the heading), `Pudotuspelit` below them.
  - The Ykkösliigacup test asserts tables, not only headings.
  - The selector offers 2026–2023.

## Files To Update

- `specs/043-liigacup.md` — this file.
- `specs/015-finnish-cups.md` — the correction, and pointers here from its
  layout and table sections.
- `src/lib/domestic-competitions.ts` — the entry and its probe comment.
- `src/lib/taso-standings-service.ts` — classification by competition; cup
  groups classified by the round-robin rule.
- `src/lib/cup-rounds.ts` — round-robin check; splitting a combined group.
- `src/app/domestic/standings/page.tsx` — CL layout when a cup season has
  tables; a drawn round not also listed in that layout.
- `tests/e2e/cup-domestic.spec.ts` — the Ykkösliigacup test asserts tables.
- `scripts/backfill-run.ts` — **no change expected**: it walks
  `DOMESTIC_COMPETITIONS` through `competitionIdForSeason`,
  `categoryIdForSeason` and `earliestSeasonFor`. Verified by running it.
- `decisions/043-liigacup.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

None outstanding. Resolved in chat, 2026-09-28:

- *Where does TASO publish it?* — `Liigacup{YY}`, 2023–2026, plus an isolated
  2015 in `spljp15`; see API & Data.
- *Is 2015 in?* — no; start from 2023.
- *The 2016–2022 gap* — moot without 2015.
- *What is `1-4`?* — semi-finals (A1 v B2, B1 v A2) and final in one group;
  drawn as a bracket, as Champions League draws its knockout.
- *Does that apply to Ykkösliigacup?* — yes, same format.
- *Are `Lohko A`/`Lohko B` tables?* — yes; the #272 regression is fixed here,
  for every cup.
- *Picker name / position* — `Liigacup`, before `Ykkösliigacup`.
- *specs/015 wording* — as proposed.
