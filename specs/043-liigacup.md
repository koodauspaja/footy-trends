# 043 — Liigacup

## Summary

Add Liigacup — the Veikkausliiga-level league cup — to `/kotimaa` as a cup
competition, and correct `specs/015-finnish-cups.md`, which records its absence
as a decision that was never made (#474).

## Scope

### In scope

- A **Liigacup** entry in `DOMESTIC_COMPETITIONS`, with `format: "cup"`, so it
  renders through the cup path specs/015 built: collapsible rounds, and
  standings tables for groups that carry points.
- `competitionIdPrefix: "Liigacup"` and two category eras (`LC2023`, then
  `LC`) — both already supported by the registry; see API & Data.
- Correcting `specs/015-finnish-cups.md`'s Out of scope line so it no longer
  says Liigacup was deliberately excluded.

### Out of scope

- **Miesten/Naisten Regions Cup, Roots Cup, Kansallinen Cup** — the other three
  on specs/015's line. Whether they were misrecorded too is a separate question
  with its own answer; this spec leaves them excluded and leaves their wording
  in specs/015 alone except for removing Liigacup from the list.
- Any change to how an existing competition renders.
- Any change to the cup rendering, the bracket walk, or round-name
  normalisation from specs/015. If Liigacup's data breaks one of them, that is
  a finding to raise, not something to patch quietly inside this feature.

## UX / UI (Finnish strings)

### Picker (`/kotimaa`)

One entry joins the flat list, displayed as **`Liigacup`** (the registry's
`name`). Season pages show TASO's own `category_name` for that season, as every
other competition already does.

Position: among the cups at the end of the list — after `Naisten Suomen Cup`,
**before** `Ykkösliigacup`, since the list is ordered by tier and Liigacup is
the first-tier league cup. *(Open Question 4.)*

### Pages

No new strings. Liigacup reuses what specs/015 introduced — the collapsible
round with its summary `<round> (N ottelua)` — and everything else a domestic
competition already shows. It draws no `Pudotuspelit` bracket; see API & Data.

### Where it appears

Everywhere a domestic competition does, with no competition-specific code:

- the `/kotimaa` picker, standings and match lists;
- team pages reached from a Liigacup page;
- `Analyysit` on a cup team page (specs/040);
- head-to-head history (specs/042), which spans every competition in the
  region.

## API & Data

### Endpoints — no new provider surface

The same three TASO calls already made per competition-season: `getMatches`,
`getGroups` (`getCategory`), `getCategories`. No new endpoint, no new field.

### Caching

Unchanged. Liigacup's responses are cached under the existing
`tasoMatchesCacheKey` / `tasoCategoryCacheKey` keys with the existing TTLs,
which are keyed on `competition_id` + `category_id` and so need no change
whichever layout TASO uses.

### Competition id and category id — verified live, 2026-09-28

Probed against TASO from local dev (the drafting session could not reach it):

| `competition_id` | Categories | Matches |
|---|---|---|
| `Liigacup15` – `Liigacup22` | none | — |
| `Liigacup23` | `LC2023` (`Liigacup`) | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| `Liigacup24` | `LC` (`Liigacup`) | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| `Liigacup25` | `LC` (`Liigacup`) | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| `Liigacup26` | `LC` (`Liigacup`) | `Lohko A` 15, `Lohko B` 15, `1-4` 3 |
| `Liigacup27` | none | — |

Every match in 2023–2026 is played. `getCompetitions` lists only
`Liigacup26` — it lists current competitions, not history, which is why the
earlier ids had to be probed directly.

Separately, `getCategories?competition_id=spljp15` returns a category
`LC` / `Liigacup` inside the umbrella, and no `spljp16`–`spljp26` season does.
Whether it holds any matches is Open Question 1.

So Liigacup is **its own competition**, like Ykkösliigacup, and published
under **two category ids**:

```ts
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

This is registry-only: `competitionIdForSeason` already takes a per-competition
prefix (the mixed-case `Liigacup` is just a string to it), and
`categoryIdForSeason` already resolves eras. Season floor **2023**.

`SEASON_COMPETITION_ID` (`^spljp\d{2}$`, specs/011) is **not** relaxed.
Liigacup's current season follows the umbrella's, exactly as Ykkösliigacup's
does.

### Shape: two groups and a `1-4` group — no bracket

Every season 2023–2026 has the same shape: two six-team round-robins (15
matches each) and a `1-4` group of 3 matches — presumably two semi-finals and a
final, all published as **one 4-team group**.

specs/015's backwards walk needs a 2-team knockout group to start a bracket, and
there is none, so **no `Pudotuspelit` section is drawn** in any season. `1-4`
renders as a match list if it carries no points (as Ykkösliigacup's `1-4`
does) — to be confirmed, Open Question 2. This is the same outcome
Ykkösliigacup has today, and changing the walk to split a combined group into
rounds is out of scope.

## Edge Cases

- **No gaps in range.** 2023–2026 are contiguous, so the selector (a floor, not
  a list) offers no season without data.
- **Two category ids.** 2023 is `LC2023`, 2024 on is `LC`; a stored 2023 row
  and a 2024 row both resolve to Liigacup via `competitionCodeForCategory`.
- **`LC` also exists in `spljp15`.** Harmless while Liigacup's floor is 2023:
  nothing requests `spljp15`/`LC`. If Open Question 1 brings 2015 in, it is not.
- **Groups plus a combined `1-4`** — `Lohko A`/`Lohko B` render as standings
  tables, `1-4` as a match list; no `Pudotuspelit` section, no error.
- **A level match in `1-4`** — shown with its score, as in any match list. The
  bracket's `winner` handling from specs/015 does not come into play, because
  nothing is drawn.
- **`Liigacup27`** — returns no categories today. When 2027 is the current
  season it is offered, and until TASO publishes it the page shows the existing
  empty state, exactly as for `M1LCUP27`.
- **A `kilpailu` value below Liigacup's floor** — not offered by the selector;
  a hand-typed URL is handled as for every other competition.
- **A team that appears only in Liigacup** in the stored data — its team page
  resolves through `competitionCodeForCategory`, which gains Liigacup's
  category id(s) by being in the registry.

## Performance & Limits

- No new requests per page. One competition added to the refresh set, so the
  scheduled refresh does one more competition's worth of TASO calls per season
  it covers — small next to MSC, which is up to ten rounds and 248 teams.
- No pagination changes.

## Security & Secrets

- No new environment variables. `TASO_API_KEY` already exists.
- `kilpailu` is validated against the registry before reaching a provider URL,
  cache key or query, as today. A `competitionIdPrefix`, if needed, is a
  constant in the registry — never built from input.
- No secrets committed.

## Acceptance Criteria

- [ ] `/kotimaa` lists `Liigacup` among the cups, in the position agreed in
      Open Question 4.
- [ ] The Liigacup season selector offers 2023 onward and nothing earlier.
- [ ] Liigacup 2026 renders `Lohko A` and `Lohko B` as standings tables and
      `1-4` as a collapsible match list of 3 matches.
- [ ] Liigacup 2023 renders the same way, read from category `LC2023`.
- [ ] No Liigacup season shows a `Pudotuspelit` section, and none errors.
- [ ] A team page reached from a Liigacup page loads, and its `Analyysit`
      section renders as a cup team page does (specs/040).
- [ ] Head-to-head history (specs/042) between two Veikkausliiga clubs includes
      their Liigacup meetings once the data is stored.
- [ ] `npm run backfill` fetches and stores Liigacup 2023–2026 — `Liigacup23`
      with `LC2023`, `Liigacup24`–`26` with `LC` — and a re-run skips them.
- [ ] Existing competitions on `/kotimaa` are unchanged.
- [ ] `specs/015-finnish-cups.md`'s Out of scope line no longer claims Liigacup
      was deliberately excluded.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/domestic-competitions.test.ts`
  - The `LC` entry exists with `format: "cup"`.
  - `competitionIdForSeason("LC", 2023)` is `Liigacup23`, and 2026 is
    `Liigacup26`.
  - `categoryIdForSeason("LC", 2023)` is `LC2023`; 2024 and 2026 are `LC`.
  - `categoryIdsFor("LC")` is `["LC", "LC2023"]`.
  - `earliestSeasonFor("LC")` is 2023.
  - `isDomesticCup("LC")` is true.
  - `competitionCodeForCategory` maps both `LC` and `LC2023` to `LC`.
- `tests/unit/app/domestic/standings/page.test.tsx`
  - A Liigacup season shaped like the verified data — two 6-team groups with
    points, one 4-team `1-4` group without — renders two tables, one match
    list, and no `Pudotuspelit`.
- `tests/e2e/` — `/kotimaa/sarjataulukko?kilpailu=LC&kausi=2026` shows
  `Lohko A`, `Lohko B` and `1-4`.

## Files To Update

- `specs/043-liigacup.md` — this file.
- `specs/015-finnish-cups.md` — the Out of scope line: Liigacup removed from
  it, with a note that its exclusion was misrecorded and a pointer here.
- `src/lib/domestic-competitions.ts` — one entry, plus a comment recording the
  live probes behind its season floor.
- `scripts/backfill-run.ts` — **no change expected.** It already walks
  `DOMESTIC_COMPETITIONS` and resolves each season through
  `competitionIdForSeason`, `categoryIdForSeason` and `earliestSeasonFor`, so
  the registry entry puts Liigacup in the backfill. Verified by running it, per
  the acceptance criterion, not assumed. If Open Question 1 brings 2015 in, this
  stops being true: `alreadyStoredTaso` keys on `category_id` + season only, and
  the backfill resolves one prefix per competition.
- `decisions/043-liigacup.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

1. **Does `spljp15`/`LC` hold matches? — blocking.** The category exists; the
   probe of its matches came back empty, but through a filter that would also
   hide an error, so it is not yet proven empty. If it is empty, the floor is
   2023 and this is registry-only. If it has matches, 2015 lives in the
   umbrella while 2023+ live under `Liigacup{YY}` — one competition in two
   `competition_id` schemes, which `competitionIdPrefix` (one prefix for a
   competition's whole history) cannot express. That would be new plumbing and
   a decision: build it, or set the floor at 2023 and leave 2015 out on
   purpose, saying so here.
2. **Does `1-4` carry points?** Expected not, like Ykkösliigacup's `1-4`, in
   which case it renders as a match list. If it does, it renders as a
   four-team table, which would read oddly for three knockout matches.
3. **Picker name** — `Liigacup` (proposed, TASO's own `category_name`), or a
   longer form such as `Miesten Liigacup`? Season pages show TASO's name
   regardless; this is only the registry's `name`.
4. **Picker position** — before `Ykkösliigacup` (proposed: tier order), or at
   the very end?
5. **specs/015 correction wording** — proposed: remove Liigacup from the
   excluded list and add *"Liigacup was listed here in error; its exclusion was
   not decided. Added in specs/043-liigacup.md (#474)."* The line keeps saying
   the other three are excluded, since this spec does not decide them.

Resolved: *Where does TASO publish Liigacup, and for which seasons?* —
`Liigacup{YY}`, 2023–2026, verified live 2026-09-28; see API & Data.
