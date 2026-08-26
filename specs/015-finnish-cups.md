# 015 — Finnish cups

## Summary

Add the Finnish cup competitions — Miesten Suomen Cup, Naisten Suomen Cup and
Ykkösliigacup — to `/kotimaa`, each rendered round by round, with a drawn
bracket for the closing rounds.

## Scope

### In scope

- **`MSC`** (Miesten Suomen Cup) and **`NSC`** (Naisten Suomen Cup) added to
  `DOMESTIC_COMPETITIONS`. Both live inside the existing `spljp{YY}` season
  umbrella and need no new provider plumbing.
- **Ykkösliigacup** added, which does need new plumbing: it is its own
  `competition_id` (`M1LCUP{YY}`), not a category inside `spljp{YY}`.
- A **drawn bracket** for the closing rounds of a knockout cup, reusing the
  `CupBracket` component built in specs/014-champions-league.md.
- Every other round rendered as it already is — see **Almost all of this
  already works** below.

### Out of scope

- Champions League, World Cup, Euro (#68 shipped; #165 pending).
- Huuhkajat and Helmarit (#166, #167).
- **Miesten/Naisten Regions Cup, Roots Cup, Kansallinen Cup, Liigacup** —
  present in TASO, deliberately excluded (confirmed in chat).
- Any change to how league competitions render on `/kotimaa`.
- Changing `keepsATable`. Cup rounds already classify correctly through it;
  see below.

## Almost all of this already works

Verified live on 2026-08-26: **every** `MSC` group returns `points: null` for
every team — including the group stages of 2018 and 2020. `keepsATable`
(`src/lib/taso-standings-service.ts`) already treats a group with no points as
a knockout group and renders its matches as a list rather than a table, per
specs/010-playoff-group-match-list.md.

So adding `MSC`/`NSC` to the registry gives correct round-by-round rendering
with no new rendering code. The genuinely new work is the bracket, and
Ykkösliigacup's competition-id scheme.

`M1LCUP26` confirms the classification works the other way too: its `Lohko A`
and `Lohko B` carry real points (9/7/6 and 7/6/5) and will render as tables,
while its `1-4` placement group has none and will render as a match list.

## UX / UI (Finnish strings)

### Picker (`/kotimaa`)

Three entries join the existing flat, tier-ordered list:
**`Miesten Suomen Cup`**, **`Naisten Suomen Cup`**, **`Ykkösliigacup`**.
Names come from TASO's own `category_name` per season, as they already do for
every other competition, so an era that named a competition differently shows
that season's name.

### Rounds

Each round renders under its own `<h2>`, as a `MatchListTable` with the
existing `Pvm` / `Ottelu` / `Tulos` headers — and **no fourth column**. The
league pages keep their `Kierros` column, but a cup round *is* one round and
the heading directly above already names it, so the column would repeat the
same value down every row.

Each round is **collapsible**, as a native `<details>`/`<summary>`, and starts
open. A cup season stacks up to ten rounds and the opening round can be 248
teams: MSC 2025 measures ~27,000px tall on a 375px screen with everything open,
and ~1,800px with every round folded away. No client-side state is involved.
The summary carries the round name and its match count — `Juuson kierros
(123 ottelua)` — so a folded round still says how much it hides.

Open by default rather than collapsed: a round that starts hidden reads as
missing data, the same reasoning that keeps the drawn rounds listed below.

Headings come from TASO's `group_name`, **normalised for the two names TASO
spells inconsistently across eras**. Counted across every MSC and NSC season
2015–2026:

| Displayed | Normalised from | Counts |
|---|---|---|
| `Kierros N` | `N. Kierros` | 63 vs 23 |
| `Loppuottelu` | `Finaali` | 9 vs 11 |

`Kierros N` simply wins its count. `Loppuottelu` **loses** its count 9–11 and
is still the one displayed: the split is by era, not popularity — `Finaali` is
2015–2019, `Loppuottelu` 2020 onward — so the raw count only favours `Finaali`
because the older era has more seasons in range, and it flips on its own as
seasons accumulate. Choosing the loser now avoids renaming again later.

Two names that look like they should be normalised and must not be:

- **`Pikkufinaali`** is the third-place match, not a final.
- **`Finaali-Kakkonen`** is a separate Kakkonen-cup round.

So the mapping is on the **whole** group name, never a substring replace.
Every other group name — `Juuson kierros`, `Tasaus`, `Superkierros`,
`Puolivälieräkarsinnat`, `Lohko A`, and the rest — renders exactly as TASO
returns it. TASO already names them in Finnish, and inventing names for 50+
one-off strings would be guesswork.

Normalisation is display-only: the stored `group_name` is untouched, so a
reader cross-checking tulospalvelu sees the same rounds in the same order, two
of them under the name that competition uses today.

### Bracket

**Above the rounds**, under an `<h2>` reading **`Pudotuspelit`**, the closing
rounds as the left-to-right tree from specs/014-champions-league.md: one column
per round, winner in bold, aggregate beside each team.

Above rather than below, which is where Champions League puts it. The
difference is deliberate: a CL page opens with a standings table, so the
bracket cannot have the top. A Finnish cup has no table for most seasons, so
the page is a list of match lists and the bracket is the thing a reader wants
first — burying it under as many as ten rounds, one of them 248 teams wide,
would hide the most useful part of the page.

Each drawn round **also keeps its own match list below**, exactly as if it were
not drawn. The tree carries the result, the list carries the date and the
venue-ordering; and every cup season then has the same page shape whether or
not it has a bracket. A season with a bracket showing fewer round lists than
one without would read as missing data.

Round headings use the same normalised `group_name` as the round lists, not
the Finnish stage names from 014 — TASO already names these in Finnish, and
the tree must agree with the lists below it.

- A season with no qualifying closing rounds shows no `Pudotuspelit` section
  at all. It is not an error: MSC 2021 genuinely had none.
- Empty-state string, where a bracket exists but no tie has been played:
  **`Pudotuspelit eivät ole vielä alkaneet.`** (reused from 014).

## API & Data

### Endpoints — no new provider surface

The same three TASO calls already made per competition-season: `getMatches`,
`getGroups`, `getCategories`. Caching and TTLs unchanged.

### Ykkösliigacup's competition id

Every TASO helper today assumes the season umbrella
`competitionIdFromSeason(season) → "spljp" + YY`. Ykkösliigacup is
`M1LCUP{YY}`, so `DomesticCompetition` needs to declare its own scheme rather
than inheriting the umbrella.

Reachable seasons, verified live: **2024, 2025, 2026 only** — `M1LCUP22`,
`M1LCUP23` and `M1LCUP27` all return zero categories. Its season floor is
therefore 2024, which `earliestSeasonFor` already supports per competition.

`SEASON_COMPETITION_ID` (the `^spljp\d{2}$` regex used for current-season
discovery) must not be relaxed — see specs/011. Ykkösliigacup's current season
follows the umbrella's, not its own discovery.

### Choosing the bracket rounds — the load-bearing algorithm

Team count alone is not enough, and neither are names. All three traps are real,
verified live:

| Season | Trap |
|---|---|
| MSC 2018 | `Kierros 1` has **8 teams** — the *first* round, not a quarter-final |
| NSC 2015 | `Pikkufinaali` (2 teams) sits **before** `Finaali` (2 teams) |
| MSC 2021 | six 4-team groups that **do** carry points, and no knockout at all |

Names cannot be parsed either, and normalising them does not help: the two
names the display normalises (`Finaali` → `Loppuottelu`, `N. Kierros` →
`Kierros N`) still leave `Juuson kierros`, `Tasaus`, `Superkierros`,
`Puolivälieräkarsinnat`, `Kierros 1B` and some 50 other one-off strings. The
round-selection rule therefore keys on structure, never on the name — before
or after normalisation.

The rule, walking **backwards from the last group**:

1. Consider only groups `keepsATable` rejects — a knockout group.
2. Find the **latest** such group with exactly **2** teams. That is the final.
   No such group → no bracket.
3. Then the latest group *before it* with exactly **4** teams, then **8**.
4. Stop at 8. Earlier rounds stay lists.

Each round must appear before the one it feeds, so the chain is strictly
decreasing in group order. Working backwards is what makes `Pikkufinaali`
resolve correctly: `Finaali` is later, so it claims the 2-team slot and
`Pikkufinaali` is simply not in the chain — it renders as a list, which is
what a third-place match should be.

The same walk rejects MSC 2018's `Kierros 1`: `Puolivälierät` is a later
8-team group, so it wins the slot. And MSC 2021 has no 2-team knockout group
at all, so step 2 ends it.

### Ties are single-leg

Verified for MSC 2025: `Puolivälierät` 4 matches, `Välierät` 2, `Loppuottelu`
1 — one match per tie, no dateless aggregate rows. `buildBracket` already
handles single-leg ties (the World Cup shape), so no change is needed there.

An adapter maps a TASO knockout group to `BracketSourceMatch`, keyed on
`groupName` where football-data uses `stage`.

### Who won a level tie — TASO's `winner`

A Finnish cup tie cannot end level, and TASO does not itemise the shootout that
settles it. It publishes the outcome in a **`winner`** field instead, and that
is the only place the information exists.

Verified live: `MSC` 2025 returns `Home` or `Away` for all 419 matches
including the 55 that finished level, while `VL` 2025 returns `Tie` for exactly
its 40 level matches. So `winner` is `Home`/`Away`/`Tie`, and `Tie` never
occurs in a cup.

`NormalizedTasoMatch` and `taso_matches` therefore gain a nullable `winner`.
Without it the real MSC 2025 quarter-final `FC Haka 1–1 KuPS` renders as a draw
with no winner while KuPS plays the semi-final.

The bracket uses it only to break a level tie, and labels such a tie
`declared` — carrying **no** `(rp)` suffix, since asserting a shootout the data
does not record would be inventing detail. The winner is shown in bold, as
everywhere else.

### The tree has to be ordered, not just spaced

A round's ties arrive in kickoff order, which says nothing about who plays whom
next. Drawn as-is, a team can win the *top* quarter-final and appear in the
*bottom* semi-final, so the connectors imply a pairing that never happened —
MSC 2026 does exactly this.

`orderRoundsForTree` works backwards from the last round, taking its order as
given, and for each tie there places the two earlier ties its participants came
from next to each other. Presentation only: `buildBracket` stays chronological
for the round lists beside the tree. A tie whose winner does not appear in the
next round — a third-place match — keeps its place at the end rather than being
dropped.

## Edge Cases

- **A season with no knockout rounds** (MSC 2021) — no `Pudotuspelit`
  section, no error.
- **A third-place match** (`Pikkufinaali`, NSC 2015) — listed, never drawn.
- **A small early round** (`Kierros 1` with 8 teams, MSC 2018) — listed,
  because a later 8-team round exists.
- **Group stages inside a cup** (`Lohko A–E`, MSC 2018; `Lohko 1–4`, NSC 2020;
  `Lohko A/B`, Ykkösliigacup) — render as standings tables, since they carry
  points. Tables and knockout lists coexist on one page.
- **A 248-team opening round** (`Juuson kierros`, MSC 2025) — a match list like
  any other. It is not paginated; see **Performance**.
- **An incomplete chain** — a season with a final and semi-finals but no
  quarter-final group draws the two rounds it has.
- **A knockout group with no matches yet** — the round is drawn with the ties
  it has; `buildBracket` already leaves an unplayed tie without an aggregate.
- **Ykkösliigacup before 2024** — outside its season floor, so the selector
  never offers it.
- **A cup season TASO has not published** — the existing empty/error handling
  applies unchanged.

## Performance & Limits

- No new requests. Three TASO calls per competition-season, as today.
- The largest response is MSC's opening round: 248 teams, ~120 matches in one
  group. It renders as one plain table like every other round, now inside a
  collapsible `<details>` — the season's
  full match list is already fetched in one call and rendered in one table
  elsewhere in the app, so no pagination or collapsing is introduced. It is
  still the biggest single group the app will have rendered, so it gets a look
  at 375px before this is called done.
- The bracket is O(n) over at most 7 ties.

## Security & Secrets

- No new environment variables. `TASO_API_KEY` already exists.
- `kilpailu` and `kausi` are validated against fixed allowlists before reaching
  a provider URL, cache key or query, exactly as today. Ykkösliigacup's
  competition-id scheme must not interpolate an unvalidated value.
- No secrets committed.

## Acceptance Criteria

- [ ] `/kotimaa` lists `Miesten Suomen Cup`, `Naisten Suomen Cup` and
      `Ykkösliigacup` alongside the existing competitions.
- [ ] MSC 2025 renders all ten rounds, `Juuson kierros` through `Loppuottelu`,
      each as a match list.
- [ ] MSC 2025 draws a bracket of `Puolivälierät` → `Välierät` → `Loppuottelu`,
      with HJK shown as the winner of the 1–0 final over KuPS.
- [ ] The bracket appears **above** the round lists, and each drawn round still
      has its own match list below.
- [ ] MSC 2018 does **not** draw `Kierros 1`, despite its 8 teams, and renders
      `Lohko A`–`Lohko E` as standings tables.
- [ ] NSC 2015 lists `Pikkufinaali` and does not place it in the bracket.
- [ ] MSC 2021 renders without a `Pudotuspelit` section and without an error.
- [ ] Ykkösliigacup 2026 renders `Lohko A` and `Lohko B` as tables and `1-4`
      as a match list.
- [ ] The Ykkösliigacup season selector offers only 2024–2026.
- [ ] Existing league competitions on `/kotimaa` are unchanged.
- [ ] `N. Kierros` seasons (MSC 2024) display `Kierros N`, and `Finaali`
      seasons (MSC 2018, NSC 2015) display `Loppuottelu`.
- [ ] `Pikkufinaali` and `Finaali-Kakkonen` are **not** renamed.
- [ ] Each cup round is collapsible and starts open, and its summary shows the
      match count.
- [ ] A cup round's match list has no `Kierros` column; a league's playoff
      group still has one.
- [ ] A cup page shows no round selector, since none of its groups respond to
      one.
- [ ] MSC 2025's `FC Haka 1–1 KuPS` shows KuPS as the winner, from TASO's own
      `winner` field.
- [ ] MSC 2026's bracket draws each semi-final against the two quarter-finals
      that actually feed it.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/domestic-competitions.test.ts`
  - The three new entries exist with the right ids and season floors.
  - Ykkösliigacup resolves `M1LCUP24`/`25`/`26`; the others resolve `spljp{YY}`.
  - `earliestSeasonFor("M1LCUP")` is 2024.
- `tests/unit/lib/cup-rounds.test.ts` (new) — round-name normalisation and the
  backwards walk.
  - `1. Kierros` → `Kierros 1`; `Kierros 1` unchanged.
  - `Finaali` → `Loppuottelu`; `Loppuottelu` unchanged.
  - `Pikkufinaali` and `Finaali-Kakkonen` unchanged — the guard against a
    substring replace.
  - An unrecognised name passes through untouched.
  - The backwards walk, one case per trap:
  - MSC 2025 shape → Puolivälierät, Välierät, Loppuottelu.
  - MSC 2018 shape → `Kierros 1` excluded, `Puolivälierät` chosen.
  - NSC 2015 shape → `Pikkufinaali` excluded, `Finaali` chosen.
  - MSC 2021 shape → no bracket.
  - Final but no semi-final → the rounds that exist.
  - A group that keeps a table is never a bracket round.
- `tests/unit/app/domestic/standings/page.test.tsx`
  - A cup season renders lists plus a bracket; a league season is unchanged.
- `tests/integration/taso.test.ts` — the new competition-id scheme resolves.
- `tests/e2e/` — `/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025` shows the ten
  round headings and a `Pudotuspelit` section.

## Files To Update

- `specs/015-finnish-cups.md` — this file.
- `src/lib/domestic-competitions.ts` — three entries; a per-competition
  competition-id scheme.
- `src/lib/taso.ts` — competition-id resolution no longer assumes `spljp`.
- `src/lib/cup-rounds.ts` (new) — the backwards walk that picks bracket rounds.
- `src/lib/taso-standings-service.ts` — expose the chosen rounds alongside the
  existing group classification.
- `src/app/domestic/standings/page.tsx` — render the bracket.
- `src/components/cup-bracket.tsx` — reused; adapter for TASO-shaped input.
- `decisions/015-finnish-cups.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

None outstanding. The four raised during spec review were resolved in chat on
2026-08-26 and are recorded above rather than left here:

0. **Round-name normalisation — resolved: normalise two names, whole-string.**
   `N. Kierros` → `Kierros N` (63 vs 23) and `Finaali` → `Loppuottelu`, the
   latter deliberately against its own 9–11 count because the split is by era
   and reverses as seasons accumulate.

1. **Bracket position — resolved: above the rounds.** Deliberately unlike
   Champions League, because a cup page has no standings table to lead with.
2. **Drawn rounds also listed — resolved: yes.** The duplication is accepted so
   that every cup season's page has the same shape, and because the list
   carries the date the tree does not.
3. **`Juuson kierros` at 248 teams — resolved: one plain table**, like every
   other round — and revisited on seeing it: at ~27,000px the page needed a way
   to fold a round away, so every round became a collapsible `<details>` that
   starts open.
