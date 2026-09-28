# 043 — Liigacup

## Summary

Add Liigacup — the Veikkausliiga-level league cup — to `/kotimaa` as a cup
competition, and correct `specs/015-finnish-cups.md`, which records its absence
as a decision that was never made (#474).

## Scope

### In scope

- A **Liigacup** entry in `DOMESTIC_COMPETITIONS`, with `format: "cup"`, so it
  renders through the cup path specs/015 built: collapsible rounds, standings
  tables for any group stage that carries points, and a `Pudotuspelit` bracket
  where the closing rounds qualify under specs/015's backwards walk.
- Whatever competition-id plumbing TASO's layout requires — either none (a
  category inside `spljp{YY}`, like `MSC`/`NSC`) or a `competitionIdPrefix`
  (its own competition, like `M1LCUP{YY}`). **Which one is not yet known**; see
  Open Question 1.
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
the first-tier league cup. *(Open Question 3.)*

### Pages

No new strings. Liigacup reuses everything specs/015 introduced —
`Pudotuspelit`, `Pudotuspelit eivät ole vielä alkaneet.`, the round summary
`<round> (N ottelua)` — and everything else a domestic competition already
shows.

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

### Competition id and category id — to be verified live

Not yet checked, and it decides how much work this is:

- **Umbrella:** Liigacup is a category inside `spljp{YY}`. Then this is a
  registry entry (`code`, `name`, `categories`, `format: "cup"`) and nothing
  else, like `MSC`.
- **Own prefix:** Liigacup is its own `competition_id`, like `M1LCUP{YY}`. Then
  it also declares `competitionIdPrefix`. `competitionIdForSeason` already
  supports that, so it is still registry-only — the plumbing specs/015 added is
  generic.

Either way, the implementation first confirms, live against TASO:

1. the `competition_id` and `category_id` Liigacup is published under;
2. whether that `category_id` changed across eras, which would mean more than
   one `CompetitionCategory` entry, as for the junior competitions;
3. **every season in 2015–2026 that returns data**, which becomes its season
   floor and must be recorded in the registry comment the way Ykkösliigacup's
   `M1LCUP22`/`23`/`27` probes are.

`SEASON_COMPETITION_ID` (`^spljp\d{2}$`, specs/011) is **not** relaxed. If
Liigacup has its own prefix, its current season follows the umbrella's, exactly
as Ykkösliigacup's does.

## Edge Cases

- **Seasons with no Liigacup.** If TASO has gaps inside the range (a season the
  cup was not played), the selector still offers that season, since the
  selector is a floor, not a list, and the page shows the existing empty state.
  *(Open Question 2 — whether a gap should instead be hidden.)*
- **Group stage followed by knockout** — the group tables render as standings
  (they carry points) and the knockout rounds as lists, as for Ykkösliigacup.
- **No qualifying closing rounds** in a season — no `Pudotuspelit` section, no
  error, per specs/015.
- **Only a group stage** in a season (a round-robin with no final) — tables
  only, no bracket.
- **A level tie** — decided by TASO's `winner`, labelled `declared`, no `(rp)`,
  per specs/015.
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

Seasons named below are placeholders until Open Question 1 is answered; the
real seasons replace them before the go.

- [ ] `/kotimaa` lists `Liigacup` among the cups, in the position agreed in
      Open Question 3.
- [ ] The Liigacup season selector offers exactly the seasons verified live,
      and no earlier ones.
- [ ] One verified Liigacup season renders every round TASO returns for it,
      with any group stage as standings tables and knockout rounds as
      collapsible match lists.
- [ ] Where that season has a final, a `Pudotuspelit` bracket is drawn above
      the rounds and names the winner TASO records.
- [ ] A team page reached from a Liigacup page loads, and its `Analyysit`
      section renders as a cup team page does (specs/040).
- [ ] Head-to-head history (specs/042) between two Veikkausliiga clubs includes
      their Liigacup meetings once the data is stored.
- [ ] Existing competitions on `/kotimaa` are unchanged.
- [ ] `specs/015-finnish-cups.md`'s Out of scope line no longer claims Liigacup
      was deliberately excluded.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/domestic-competitions.test.ts`
  - The Liigacup entry exists with the verified `code`, `format: "cup"` and
    season floor.
  - `competitionIdForSeason` resolves Liigacup to the verified id for a
    supported season (`spljp{YY}` or its own prefix).
  - `categoryIdForSeason` resolves each era, if there is more than one.
  - `earliestSeasonFor` returns the verified floor.
  - `isDomesticCup` is true for it.
  - `competitionCodeForCategory` maps its category id(s) back to it.
- `tests/unit/app/domestic/standings/page.test.tsx`
  - A Liigacup season shaped like the verified data renders as a cup page.
- `tests/e2e/` — `/kotimaa/sarjataulukko?kilpailu=<code>&kausi=<season>` shows
  the round headings of one verified season.

## Files To Update

- `specs/043-liigacup.md` — this file.
- `specs/015-finnish-cups.md` — the Out of scope line: Liigacup removed from
  it, with a note that its exclusion was misrecorded and a pointer here.
- `src/lib/domestic-competitions.ts` — one entry, plus a comment recording the
  live probes behind its season floor.
- `decisions/043-liigacup.md` — written by the implementing agent.
- `.env.example` — **no change**; noted so the reviewer knows it was checked.

## Open Questions

1. **Where does TASO publish Liigacup, and for which seasons? — blocking.**
   It could not be checked while drafting: the session that wrote this has no
   `TASO_API_KEY` and its network policy denies `spl.torneopal.net`. The
   answer decides whether this is a one-entry change, and the acceptance
   criteria cannot name real seasons without it. Needs either a live check from
   an environment that can reach TASO, or the answer from someone who knows.
   Worth noting as a possibility, not an assumption: if Liigacup was not played
   in some or all recent years, the reachable range may be short or have gaps.
2. **Seasons with no Liigacup inside the range** — show the existing empty
   state (proposed, and what every other competition does), or hide those
   seasons from the selector (new behaviour no competition has today)?
3. **Picker position** — before `Ykkösliigacup` (proposed: tier order), or at
   the very end?
4. **Picker name** — `Liigacup`, or a longer form such as `Miesten Liigacup`?
   TASO's own `category_name` is still what season pages show; this is only
   the registry's `name`.
5. **specs/015 correction wording** — proposed: remove Liigacup from the
   excluded list and add *"Liigacup was listed here in error; its exclusion was
   not decided. Added in specs/043-liigacup.md (#474)."* The line keeps saying
   the other three are excluded, since this spec does not decide them.
