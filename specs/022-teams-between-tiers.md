# 022 — Teams between tiers

## Summary

When a team exists but did not play the competition being asked for, say so —
name the team, and point at where it actually played — instead of the current
`Joukkuetta ei löytynyt.`, which is the same answer the site gives for a team id
that does not exist at all.

## The problem, measured

Promotion and relegation mean a club's seasons are spread across tiers, while a
team page's season selector offers every season the *competition* has. The
combinations that result are reachable, common, and dead.

Measured on 2026-09-02 against stored data:

| Competition | Clubs | Selector options | Dead options | |
|---|---|---|---|---|
| Veikkausliiga | 22 | 264 | **120** | **45.5%** |
| Premier League | 27 | 108 | 28 | 25.9% |

Nearly half of the Veikkausliiga options a reader can pick end at
`Joukkuetta ei löytynyt.` Real examples, all confirmed in a browser:

| URL | What it says | What is true |
|---|---|---|
| `/kotimaa/joukkue/60561?kilpailu=VL&kausi=2026` | `Joukkuetta ei löytynyt.` | FC Haka was relegated; it is playing Ykkösliiga 2026 |
| `/kotimaa/joukkue/60808?kilpailu=VL&kausi=2018` | the same | HIFK played Ykkönen that season |
| `/ulkomaat/joukkue/328?kilpailu=PL&kausi=2024` | the same | Burnley were in the Championship |

The page names the competition it failed to find the team in, offers a selector
full of further dead ends, and links to a standings table the team is not in.
**The team's own name never appears.** A reader cannot tell "this club does not
exist" from "this club was in a different tier that year", because the site says
the same thing for both.

Finnish clubs that move between tiers are not exotic: FC Haka (Ykkönen
2015–2019, Veikkausliiga 2020–2025, Ykkösliiga 2026), FC Lahti (Veikkausliiga,
down in 2025, back in 2026), EIF (up in 2024, down since), HIFK (Veikkausliiga
with a Ykkönen year in 2018).

## Scope

### In scope

- Telling a team that exists apart from one that does not, on all three regions'
  team pages.
- Naming the team on that page.
- Pointing at where the team did play — that season, or its most recent.
- The season selector offering the seasons the team played anywhere in the
  region, and landing on the competition it played that season.

### Out of scope

- **Any change to a page that does resolve.** A team with matches in the asked
  competition and season renders exactly as it does today.
- Backfilling seasons the app has never stored: this is about describing what we
  have, not fetching more.
- The `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit` routes, which have
  no team pages (#246 settled that).
- Promotion and relegation as *facts* — no table says "relegated", no arrows, no
  history of movements. The page reports which competitions a team has matches
  in, which is all the data supports.

## UX / UI (Finnish strings)

### A team that exists, in a competition or season it did not play

| Element | Content |
|---|---|
| Heading | `FC Haka – Veikkausliiga 2026` |
| Body | `Joukkue ei pelannut tässä sarjassa tällä kaudella.` |
| Where it did play, same season | `Kaudella 2026: Ykkösliiga` — a link to that page |
| If it played nothing that season | `Joukkueen uusin kausi: Ykkösliiga 2026` — a link |

The heading names the competition and season, so the body needs no inflected
competition name — `Veikkausliigassa`, `Ykkösliigassa`, `Miesten Suomen Cupissa`
would each have to be derived, and Finnish case endings are not something to
generate from a registry string.

A season the team played in **several** competitions lists them all, in the
order the competitions appear in the picker.

### A team that does not exist

Unchanged from specs/020: heading `Joukkue`, body `Joukkuetta ei löytynyt.`, no
selector, no standings link.

### The season selector follows the club

Picking a season takes the reader to the competition the club played that
season. From FC Haka's Veikkausliiga 2025 page, choosing 2026 lands on
Ykkösliiga 2026 with its matches — not on an empty Veikkausliiga 2026.

Two rules make that unambiguous:

- **The dropdown offers the seasons the club played**, in any competition in
  this region, rather than the seasons the competition has. FC Haka's page
  offers 2015–2026 because it played every one of them somewhere; a club with a
  gap in the stored data does not have that year offered at all. This is what
  removes the 120 dead options rather than relabelling them.
- **Where a club played two competitions in one season, the selector lands on
  the one with more matches that season.** A 27-game league beats a 2-game cup
  run, so the reader arrives where the club actually spent the year. Measured
  from stored rows, so it needs no ranking of tiers and no registry of which
  competition outranks which — neither of which exists in the data.

**This is navigation, not rendering.** A URL still renders exactly what it says:
`?kilpailu=VL&kausi=2026` shows Veikkausliiga 2026 and the message above, so a
typed or bookmarked address never silently means something else. The message is
also what a season the club played *nowhere* falls back to.

## API & Data

One grouped query per team page, alongside the two specs/020 already makes, and
cached the same way:

```sql
SELECT competition/category, season_id
FROM {matches|taso_matches}
WHERE (home_team_provider_id = :id OR away_team_provider_id = :id)
  AND {region or bucket predicate}
GROUP BY competition/category, season_id
```

It answers all three needs at once: which seasons the selector offers, where the
team played in the asked season, and what its most recent context is. The
`away_team_provider_id` index from specs/020 already serves it.

**The club's name is a second, separate lookup, and only on the page that needs
it.** A page that renders matches reads the name off the first of them; only the
"played elsewhere" page has no match to read, so `getTeamName` runs there and
nowhere else. Folding it into the grouped query would have made every team page
pay for it.

No provider call.

## Edge Cases

| Case | Behaviour |
|---|---|
| Team exists, wrong season, right competition | The message, plus where it played that season |
| Team exists, never played this competition at all | The message, plus its most recent context |
| Team played two competitions that season | Both listed, picker order |
| Team id that does not exist | specs/020's reduced page, unchanged |
| The seasons lookup fails **and the page has no matches** | The page's error state — a database that could not answer is neither an unknown club nor a club that played elsewhere |
| The seasons lookup fails **while the page has matches** | The matches, as normal. The failed lookup only costs the selector its narrowed options; blanking a page whose content is correct would be a worse answer than showing it |
| A stored season the app can no longer select | Not offered by the selector: choosing it would send a `kausi` the page rejects, landing the reader on a fallback season instead of where they clicked |
| The season being shown is one the club never played | Still offered, and selected — a dropdown missing its own page's season shows a different one as chosen |
| Placeholder id `0` | Same — never resolves |
| Team whose only stored matches are in a category the picker does not claim | Treated as not existing, as specs/020 does |
| A competition the team played in a season the app can no longer select | Not offered; the link points only at pages that render |
| Club played two competitions that season | Selector lands on the one with more matches; the message, when reached directly, lists both |
| Team with exactly one stored season | Selector offers one season; no "uusin kausi" line, because it is the page you are on |

## Performance & Limits

One extra indexed query per team page, cached per request. No provider call, so
no rate limit applies. The grouped result is small: the deepest club in the data
has twelve seasons across three competitions.

## Security & Secrets

None. No new env var or credential; the id is already parsed and bound.

## Acceptance Criteria

- [ ] `/kotimaa/joukkue/60561?kilpailu=VL&kausi=2026` names FC Haka, says it did
      not play that competition that season, and links to Ykkösliiga 2026
- [ ] `/kotimaa/joukkue/60808?kilpailu=VL&kausi=2018` does the same for HIFK and
      Ykkönen 2018
- [ ] `/ulkomaat/joukkue/328?kilpailu=PL&kausi=2024` does the same for Burnley
      and the Championship
- [ ] A team that played nothing in the asked season is offered its most recent
      season instead
- [ ] The season selector offers the seasons the club played anywhere in the
      region — FC Haka's page offers 2015–2026, not Veikkausliiga's own range
- [ ] Choosing 2026 there navigates to Ykkösliiga 2026 and renders its matches
- [ ] A club that played two competitions in one season lands on the one with
      more matches that season
- [ ] Navigating by selector never lands on a page with no matches
- [ ] A team id that does not exist still gets specs/020's reduced page, with no
      selector and no standings link
- [ ] A page that resolves is unchanged, at every region
- [ ] All new strings are Finnish

## Tests Required

### Unit

`tests/unit/lib/team-seasons.test.ts` — the query's shape and scope predicate,
mocked as `team-context`'s tests are: the grouped result, the region and bucket
predicates, the placeholder short-circuit, the error path.

`tests/unit/app/domestic/team/[id]/page.test.tsx` and
`tests/unit/app/foreign/team/[id]/page.test.tsx`, extended: the message and its
links for a team that exists in another competition, the "uusin kausi" fallback,
the restricted selector, and the unchanged reduced page for an unknown id.

### Integration

`tests/integration/team-seasons.test.ts` — the grouped query against real
Postgres, including a team with two competitions in one season.

### E2E

`tests/e2e/domestic-team.spec.ts` and `tests/e2e/team.spec.ts`, extended: the
three URLs in the acceptance criteria, and that following the offered link lands
on a page that renders matches.

Run with `--workers=1`, per the config.

## Files To Update

- `specs/022-teams-between-tiers.md` (this file)
- `decisions/022-teams-between-tiers.md` (written during implementation)
- `src/lib/team-seasons.ts` — the grouped query, the name lookup, and the view
  both pages derive from them
- `src/components/team-matches-outcome.tsx` — the five outcomes a team page's
  body can have, in one place rather than six conditions per page
- `src/components/context-notices.tsx` — widened to the three fields it reads,
  so `/kotimaa`'s pages stop carrying their own copy of the same two banners
- `src/app/domestic/team/[id]/page.tsx`, `src/components/competition-team-page.tsx`
- `src/components/team-season-selector.tsx`, `src/components/taso-season-only-controls.tsx`
  — the seasons they are given
- the test files listed above

No change to `.env.example`, `next.config.ts`, `src/db/schema.ts` or `drizzle/`.

## Open Questions

None. Both were settled in chat on 2026-09-02:

1. **The Finnish copy above is confirmed**, including `sarja` rather than
   `kilpailu` in the sentence, and the deliberate absence of an inflected
   competition name.
2. **The selector follows the club, and the message stays as the backup.**
   Restricting the dropdown to one competition's seasons — this spec's first
   idea — was rejected for hiding years the club did play, and it is the
   navigation that changes rather than what a URL renders.
