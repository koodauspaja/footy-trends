# 043 — Liigacup

## Summary

Add Liigacup — the Veikkausliiga-level league cup — to `/kotimaa` as a cup
competition, with its semi-finals and final drawn as a bracket, and correct
`specs/015-finnish-cups.md`, which records its absence as a decision that was
never made (#474).

## Scope

### In scope

- A **`Liigacup`** entry in `DOMESTIC_COMPETITIONS`, `format: "cup"`, placed
  after `Naisten Suomen Cup` and before `Ykkösliigacup`.
- Its two `competition_id` schemes and two category ids (see API & Data).
- Cup classification keyed on the **competition**, not the `category_id` — a
  fix Liigacup needs, because its 2023 category is `LC2023`.
- A **`Pudotuspelit` bracket drawn from the `1-4` group**, which holds the two
  semi-finals and the final in one group (see API & Data).
- Correcting `specs/015-finnish-cups.md`'s Out of scope line.

### Out of scope

- **Miesten/Naisten Regions Cup, Roots Cup, Kansallinen Cup** — the other three
  on specs/015's line. Whether they were misrecorded too is a separate question;
  this spec leaves them excluded.
- Round-name normalisation, and the backwards walk for cups whose rounds are
  separate groups (MSC, NSC) — unchanged.
- Whether a cup's points-carrying groups render as tables — see Open
  Question 4. Not changed here unless that question says so.

## UX / UI (Finnish strings)

### Picker (`/kotimaa`)

**`Liigacup`**, after `Naisten Suomen Cup` and before `Ykkösliigacup` — tier
order, Liigacup being the first-tier league cup (confirmed in chat
2026-09-28). Season pages show TASO's own `category_name` per season, as every
competition already does.

### Season page

No new strings. Liigacup reuses specs/015's cup page:

- **`Pudotuspelit`** above the rounds: a two-column tree, semi-finals then
  final, winner in bold. Round headings in the tree are `Välierät` and
  `Loppuottelu` — the Finnish names Suomen Cup's tree already shows for those
  rounds, since the tree needs a heading per column and TASO names only the
  group (`1-4`), not the rounds inside it.
- Each group below it as a collapsible round, `1-4` included, with its summary
  `<group> (N ottelua)`.

### specs/015 correction

The Out of scope line loses Liigacup and gains:

> Liigacup was listed here in error; its exclusion was not decided. Added in
> specs/043-liigacup.md (#474).

(Wording confirmed in chat 2026-09-28.) The other three stay listed as
excluded.

### Where it appears

Everywhere a domestic competition does: the picker, standings and match lists,
team pages, `Analyysit` on a cup team page (specs/040), head-to-head history
(specs/042).

## API & Data

### Where TASO publishes it — verified live 2026-09-28

Probed from local dev (the drafting session cannot reach TASO):

| Season | `competition_id` | `category_id` | Groups (matches) |
|---|---|---|---|
| 2015 | `spljp15` (umbrella) | `LC` | 5 groups, 31 matches, 12 teams |
| 2016–2022 | — | — | nothing: `spljp16`–`22` have no Liigacup category, `Liigacup16`–`22` no categories |
| 2023 | `Liigacup23` | `LC2023` | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| 2024–2026 | `Liigacup24`–`26` | `LC` | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| 2027 | `Liigacup27` | — | no categories yet |

Every match 2023–2026 is played. `getCompetitions` lists only `Liigacup26`,
which is why the older ids had to be probed.

So Liigacup is **one competition under two `competition_id` schemes**: the
umbrella in 2015, its own `Liigacup{YY}` from 2023. Today
`competitionIdPrefix` sits on the competition and covers its whole history, so
it cannot say this. Whether 2015 is in at all is Open Question 1; if it is:

- `competitionIdPrefix` moves onto `CompetitionCategory`, so each era names its
  own scheme. Every existing competition keeps the same answer (no era of
  theirs declares one; Ykkösliigacup's single era carries `M1LCUP`).
- `competitionIdForSeason` resolves the era first, then its prefix.
  `scripts/backfill-run.ts`, the scheduled refresh and the forced refresh
  already go through `competitionIdForSeason`, so they follow.

```ts
{
  code: "LC",
  name: "Liigacup",
  categories: [
    { fromSeason: 2024, categoryId: "LC", competitionIdPrefix: "Liigacup" },
    { fromSeason: 2023, categoryId: "LC2023", competitionIdPrefix: "Liigacup" },
    { fromSeason: 2015, categoryId: "LC" }, // umbrella — only if 2015 is in
  ],
  format: "cup",
}
```

`SEASON_COMPETITION_ID` (`^spljp\d{2}$`, specs/011) is **not** relaxed; the
current season follows the umbrella's, as Ykkösliigacup's does.

Stored rows: `category_id` `LC` is used by both 2015 and 2024+. The two never
collide, because every stored-row lookup (`alreadyStoredTaso`,
`categoryIdsFor`, team-context resolution) also keys on the season.

### Cup classification must key on the competition

`buildGroup` in `src/lib/taso-standings-service.ts` decides "this is a cup"
with `isDomesticCup(categoryId)`, passing a **category id** to a function that
takes a **competition code**. It works today only because every existing cup's
category id equals its code (`MSC`, `NSC`, `M1LCUP`). Liigacup 2023 is
`LC2023`, which is no code, so 2023 would render as a league while 2024 renders
as a cup. Fixed by resolving the category through `competitionCodeForCategory`
(or passing the code through) before asking.

### The `1-4` group is a bracket

TASO publishes the semi-finals and the final as **one group** called `1-4`:
three matches between four teams (confirmed in chat 2026-09-28: *"1-4 are
brackets, similar to suomen cup (semifinals and final)"*). Its `getCategory`
rows are one per bracket slot — 6 rows, 4 + 2 — and their `points` are
meaningless for a table (`[4,1,1,1,0,0]` in 2023, all zero in 2025).

The format (confirmed in chat 2026-09-28): two round-robin groups; then **A1 v
B2** and **B1 v A2** as semi-finals; the two winners meet in the final. The
split below does not rely on that pairing — it reads the structure of the
matches, not the group positions — but the pairing is what the drawn tree
shows, and it is what the unit tests' fixtures are built from.

specs/015's backwards walk cannot draw it: it looks for a separate 2-team group
as the final, and there is none. So a knockout group is **split into rounds by
its own structure** before the walk sees it:

1. A group qualifies when its matches involve exactly **4 distinct teams** in
   exactly **3 matches**, and the **latest-kicking-off** match is between the
   winners of the other two — winner from TASO's `winner` field, as for every
   other cup tie.
2. Those two earlier matches become a 4-team round `Välierät`, the last one a
   2-team round `Loppuottelu`, both carrying the group's id for their list.
3. A group that does not qualify is left whole, exactly as today.

Structural rather than by name, for the same reason specs/015 gives: `1-4` is
a label, not a promise. A `1-4` where the last match is between the two semi
losers — a third-place match — fails rule 1 and stays a list.

Whether the split also applies to **Ykkösliigacup's** `1-4` is Open
Question 3: specs/015 records it as a placement group rendered as a list, and a
generic rule would draw it too if its shape matches.

### Caching

Unchanged: same three calls per competition-season (`getMatches`,
`getCategory`, `getCategories`), same keys, same TTLs. Keys include
`competition_id`, so the two schemes cache separately.

## Edge Cases

- **Two category ids** — 2023 `LC2023`, 2024+ `LC`; both resolve to Liigacup,
  and both render as a cup (see the classification fix).
- **The 2016–2022 gap** (only if 2015 is in) — Open Question 2.
- **A `1-4` not yet fully played** — the final is unknown or has no winner, so
  rule 1 cannot confirm the shape: the group stays a plain list and no bracket
  is drawn until it can. No half-drawn tree from a guess.
- **A level semi-final or final** — decided by TASO's `winner`, labelled
  `declared`, no `(rp)`, per specs/015.
- **A third-place match in a `1-4`-shaped group** — fails rule 1, stays a list.
- **`Liigacup27`** — offered once 2027 is current; until TASO publishes it the
  existing empty state shows, as for `M1LCUP27`.
- **2015's own shape** — five groups; how its knockout is published is not yet
  known (Open Question 1 asks for it). It gets a bracket only if it satisfies
  either specs/015's walk or the split above; otherwise lists, no error.

## Performance & Limits

- No new requests per page. The backfill and refresh gain one competition:
  four seasons (five with 2015), three calls each.
- The split is O(1): at most three matches per group examined.

## Security & Secrets

- No new environment variables; `TASO_API_KEY` exists.
- `kilpailu` is validated against the registry before reaching a provider URL,
  cache key or query. Every `competitionIdPrefix` is a registry constant, never
  built from input.
- No secrets committed.

## Acceptance Criteria

- [ ] `/kotimaa` lists `Liigacup` after `Naisten Suomen Cup` and before
      `Ykkösliigacup`.
- [ ] The season selector offers 2023–2026 — plus whatever Open Questions 1 and
      2 settle for 2015 and 2016–2022.
- [ ] Liigacup 2026 shows `Pudotuspelit` above the rounds, with `Välierät` (2
      ties) feeding `Loppuottelu` (1 tie), and the final's winner in bold as
      TASO records it.
- [ ] Liigacup 2023, read from `LC2023`, renders as a cup exactly as 2026 does.
- [ ] `Lohko A`, `Lohko B` and `1-4` each render as a collapsible round below
      the bracket.
- [ ] MSC, NSC and every league render exactly as before; Ykkösliigacup as Open
      Question 3 settles.
- [ ] `npm run backfill` fetches and stores every Liigacup season in range, each
      from its own `competition_id`, and a re-run skips them.
- [ ] A team page reached from Liigacup loads, and its `Analyysit` renders as a
      cup team page does (specs/040).
- [ ] Head-to-head history (specs/042) between two Veikkausliiga clubs includes
      their Liigacup meetings once stored.
- [ ] `specs/015-finnish-cups.md`'s Out of scope line carries the agreed
      correction.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/domestic-competitions.test.ts`
  - `LC` exists, `format: "cup"`, positioned before `M1LCUP`.
  - `competitionIdForSeason("LC", 2023)` → `Liigacup23`; 2026 → `Liigacup26`;
    2015 → `spljp15` if 2015 is in.
  - `categoryIdForSeason("LC", …)`: 2023 → `LC2023`, 2024/2026 → `LC`.
  - `earliestSeasonFor("LC")` → the agreed floor.
  - `competitionCodeForCategory` maps `LC` and `LC2023` to `LC`.
  - Every existing competition's `competitionIdForSeason` answer is unchanged
    (a table over all codes and a spread of seasons).
- `tests/unit/lib/cup-rounds.test.ts`
  - A qualifying `1-4` (4 teams, 3 matches, final between the semi winners)
    splits into `Välierät` + `Loppuottelu`.
  - Last match between the semi **losers** → not split.
  - Final unplayed / no winner → not split.
  - 3 teams or 4 matches → not split.
  - A level semi decided by `winner` → the declared winner is the one in the
    final.
  - MSC/NSC shapes from specs/015's tests → unchanged.
- `tests/unit/lib/taso-standings-service.test.ts`
  - A group stored under `LC2023` is classified as a cup group.
- `tests/unit/app/domestic/standings/page.test.tsx`
  - A Liigacup season shaped like the verified data renders `Pudotuspelit` with
    two columns, and three collapsible rounds.
- `tests/e2e/cup-domestic.spec.ts`
  - `?kilpailu=LC&kausi=2026` shows `Pudotuspelit`, `Lohko A`, `Lohko B`, `1-4`.
  - The selector offers exactly the agreed seasons.

## Files To Update

- `specs/043-liigacup.md` — this file.
- `specs/015-finnish-cups.md` — the Out of scope correction.
- `src/lib/domestic-competitions.ts` — the entry; `competitionIdPrefix` per era
  if 2015 is in; a comment recording the live probes.
- `src/lib/taso-standings-service.ts` — cup classification by competition.
- `src/lib/cup-rounds.ts` — splitting a combined knockout group.
- `src/app/domestic/standings/page.tsx` — only if the split needs wiring there.
- `scripts/backfill-run.ts` — **no change expected**: it walks
  `DOMESTIC_COMPETITIONS` through `competitionIdForSeason`,
  `categoryIdForSeason` and `earliestSeasonFor`, so it follows the registry.
  Verified by running it, per the acceptance criterion.
- `decisions/043-liigacup.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

1. **Is 2015 in?** It exists — `spljp15`/`LC`, 31 matches, 12 teams, 5 groups.
   Including it costs the per-era `competitionIdPrefix` above, and opens
   question 2. Leaving it out keeps the floor at 2023 and needs a sentence here
   saying so on purpose. If in: its match shape is needed to know what it
   renders as (command in chat).
2. **If 2015 is in, what about 2016–2022?** Seven seasons with no Liigacup. The
   selector today is a floor-to-current range, so it would offer all seven, each
   showing the empty state. Hiding them needs a new registry notion — seasons a
   competition *skips* — that no competition has today.
3. **Does the `1-4` split apply to Ykkösliigacup?** specs/015 recorded its `1-4`
   as a placement group rendered as a list. If its three matches have the same
   semi-final + final shape (command in chat), a structural rule draws it too —
   a change to an existing competition, which this spec otherwise avoids.
4. **Cup groups that carry points render as match lists today** — read from the
   code, not yet seen on a page. `buildGroup` returns a match list for *every*
   group of a cup, before `keepsATable` is consulted (the #272 fix). specs/015
   says Ykkösliigacup's `Lohko A`/`Lohko B` render as tables, and its e2e test
   checks only that the headings exist, so nothing would have caught the
   difference. Liigacup's `Lohko A`/`Lohko B` would inherit the same. Fix here,
   or as a separate bug against specs/015 first?

Resolved in chat, 2026-09-28:
- *Where does TASO publish it?* — see the table in API & Data.
- *Does `1-4` carry points?* — it does, meaninglessly; it is a bracket (semis +
  final), not a table.
- *Picker name* — `Liigacup`.
- *Picker position* — before `Ykkösliigacup`.
- *specs/015 wording* — as proposed.
