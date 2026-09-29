# 047 — The rivalry: shared history beside both teams' current form

> **Status: Q1–Q11 answered in chat on 2026-09-29. Q12, a conflict between two
> of those answers, is open — not ready for the go.** Written for #355, the last of the
> matchup features after specs/042, specs/044 and specs/045. The live prediction
> #355 first named was split out as #480 on 2026-09-29 and is not part of this
> spec.

## Summary

The head-to-head page (specs/042, specs/044) says how two teams have fared
against each other. It says nothing about how either is playing **now** — and a
reader looking up a rivalry before the next meeting usually wants both at once:
"KuPS has the better record against HJK, but HJK has won four of its last five."

This puts each team's current form above the pair's shared history, on the
head-to-head page, for a rivalry that is still being played.

Almost everything exists to compose. The history is specs/042 and specs/044;
form is the `Vire` of specs/031, computed by `formSeries` / `teamMatchesInOrder`
in `form-series.ts`. What is new is reading each team's **latest** matches
regardless of season, and splitting the page into *now* and *history*.

## Scope

### In scope

- A new group `Nykyinen vire` on the head-to-head page, holding both teams'
  current form (S3, S4).
- The existing sections gathered under a second group, `Keskinäinen historia`
  (S4) — only when `Nykyinen vire` is shown (S12).
- Three of the five head-to-head routes: `/kotimaa`, `/ulkomaat` and
  `/maajoukkueet` (S10).
- Both providers, each within its own id space (S1).
- Result-level data only. No new column and no provider request.

### Out of scope

- The live prediction — #480, blocked on a prediction model (#343, #344, #345).
- A separate rivalry page or route (S3).
- Any change to what `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain` or
  `Kohtaamiset` compute or show. They move under `Keskinäinen historia`; their
  content is unchanged.
- Any change to `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit` (S10,
  S12): no form and no group headings.
- Upcoming fixtures between the pair (specs/042 S12).
- New ways to reach the page — still only from a match page (specs/042 S1).
- Changes to the team page's `Vire otteluittain` chart (specs/031).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Providers | **Each team's form is read within the pair's own source** | specs/042 S6. A team is only identified within one provider, and the pair already is. |
| S2 | What "form" measures | **The last five finished matches' results, and `(3 × V + T) / 5` over them** | The standings table's `Vire` and specs/031's chart already mean this; a third definition of form would disagree with both. `FORM_WINDOW` stays 5. |
| S3 | Page or sections | **New sections on the head-to-head page** (`…/kohtaamiset/:a/:b`) | Miikka, 2026-09-29 (Q1). The page already is "a specific rivalry", is reached from every match page, and names both teams in its URL. |
| S4 | Grouping and order | **Two groups: `Nykyinen vire` first, then `Keskinäinen historia`** holding `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain`, `Kohtaamiset` in their current order | Miikka, 2026-09-29 (Q2). Form is the shorter and more time-sensitive block, so it reads first. Group headings are `h2`, the sections under them `h3`, as `Analyysit` does on the team page (#424). |
| S5 | Which matches make "current" form | **Each team's last five finished matches with both scores, in any competition of the region** — the head-to-head's scope (specs/042 S2), newest by kickoff then provider match id | Miikka, 2026-09-29 (Q3). "How are they playing now" includes last week's cup tie. Consequence, accepted: the figure can differ from the team's standings `Vire`, which counts only its league's table matches. |
| S6 | Who sees it | **Signed-in readers only**, behind `canSeeAnalytics()`, asked before the read | Miikka, 2026-09-29 (Q4). Form is an analytics panel everywhere else (specs/031). A signed-out page carries no form value in its HTML. Where the sign-in prompt sits is S11. |
| S7 | What each team's block shows | **The five results as `V`/`T`/`H`, oldest to newest as the `Vire` column reads, each linking to its match page; points per match; the date of the latest match** | Miikka, 2026-09-29 (Q5). Compact, legible at 375 px, and a reader knows the letters from the standings table. |
| S8 | A rivalry no longer being played | **`Nykyinen vire` is shown only if the pair has a meeting within the last three years.** Otherwise the group is absent — no heading, no message | Miikka, 2026-09-29 (Q6): *"must have rivalry matches not further than 3 years. so if there's no later matches than 2023 now, this block won't be shown"*. Current form beside a history that ended long ago compares two eras. "Three years" is measured in calendar years (S13). |
| S9 | Fewer than five stored matches | **That team's block shows `Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.`** in place of its results | Miikka, 2026-09-29 (Q7). One definition of form (S2). Under S5 this is a team with fewer than five stored matches in the region, in total. |
| S10 | Routes | **Not on `/maajoukkueet/huuhkajat` or `/maajoukkueet/helmarit`** | Miikka, 2026-09-29 (Q8). specs/045 S5: TASO has no stable id for Finland across categories, so "Finland's last five" is not one query. football-data's `/maajoukkueet` keeps it; S8 hides it there between tournaments where the pair has not met in three years. |

| S11 | Signed out | **No `Nykyinen vire` group at all**; the one existing `Kirjaudu sisään nähdäksesi analyysit ja trendit.` stays where specs/044 S6 put it, in place of `Tulokset` and `Maalit kilpailuittain` | Miikka, 2026-09-29 (Q9). A group holding nothing but a prompt promises content and delivers a login wall; the existing prompt already covers "analyses and trends". |
| S12 | When the groups appear | **Only together.** Both group headings are shown only when `Nykyinen vire` is; otherwise the page is exactly as today — no group headings, sections at `h2` | Miikka, 2026-09-29 (Q10, Q11). A single group is a heading over the whole page, saying nothing the page title does not. Covers the two TASO national-team routes (S10) and a rivalry S8 hides. Signed out: Q12 |
| S13 | "Within three years" | **Calendar years: a meeting in `current year − 2` or later counts.** In 2026, a 2024 meeting counts and any 2023 meeting does not. The year is the kickoff's and today's in `Europe/Helsinki`, as every date on the site | Miikka, 2026-09-29 (Q11), matching the Q6 example: "no later matches than 2023" hides the group for the whole of 2023. |

## Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q12 | **Signed out, is there a `Keskinäinen historia` heading?** Two agreed answers disagree. Q9's recommendation said a signed-out page is "the specs/044 page plus one `Keskinäinen historia` heading"; Q10 and Q11's rule (S12) says a lone group gets no heading — and signed out, history is the only group | (a) No heading: S12 applies signed out too, and a signed-out page is exactly today's page. (b) The heading stays signed out, as Q9's wording said | **(a).** One rule for every page with a single group, and signed-out readers see no change from this feature at all. Q9's wording was written before Q10 and Q11 set the rule. |

## UX / UI (Finnish strings)

Signed in, on `/kotimaa`, `/ulkomaat` and `/maajoukkueet`, with a meeting in
`current year − 2` or later (S8, S13):

1. **`Nykyinen vire`** — group heading (`h2`)
   - One block per team, first team first (the URL's order, as `Yhteenveto`):
     - Team name (`h3`)
     - `V V T H V` — five letters, oldest first, each linking to
       `…/ottelu/:id` with the same `title` the standings `Vire` column gives it
     - `2,2 pistettä ottelua kohden` — one decimal, decimal comma
     - `Viimeisin ottelu 21.9.2026`
2. **`Keskinäinen historia`** — group heading (`h2`)
   - `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain`, `Kohtaamiset` — now `h3`,
     content unchanged.

A rivalry S8 hides, and the two TASO national-team routes (S10), get the page as
today: no group headings, the sections at `h2` (S12). Signed out, there is no
`Nykyinen vire` (S11); whether `Keskinäinen historia` still heads the page is
Q12.

Reused strings:

| String | When |
|---|---|
| `Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.` | A team with fewer than five stored matches (S9) |
| `Virettä ei voitu laskea. Yritä myöhemmin uudelleen.` | That team's read failed |
| `Kirjaudu sisään nähdäksesi analyysit ja trendit.` | Signed out — where it is today, and only there (S11) |

New strings: `Nykyinen vire`, `Keskinäinen historia`,
`{ppg} pistettä ottelua kohden`, `Viimeisin ottelu {d.M.yyyy}`.

## API & Data

**No provider request, no new column.**

| Needed | Where |
|---|---|
| The pair's history, and its latest meeting for S8 | `getHeadToHeadHistory`, unchanged — its newest row is the latest meeting |
| Each team's latest five finished matches | **New read**: the team's finished matches with both scores, in the region's competitions (S5), newest by kickoff then provider match id, limited to `FORM_WINDOW`. The predicates are `getWorstOpponents`' (specs/045), with an order and a limit |
| The form value | Pure, beside `formSeries`, sharing its points rule so the two agree by construction (S2) |
| The letter and its title | The standings `Vire` column's formatting, extracted so both spell it the same way |
| Signed in | `canSeeAnalytics()`, asked before the read (S6) |

**Caching:** none, as specs/031–045. Two indexed reads of five rows each, made
only when signed in and S8 holds.

## Edge Cases

| Case | Behaviour |
|---|---|
| The pair's latest meeting is before `current year − 2` (a 2023 meeting, in 2026) | No `Nykyinen vire`, no group headings, and no form read is made (S8, S12, S13) |
| The pair's latest meeting is on 1 January of `current year − 2`, Helsinki time | Counts (S13) |
| The pair's latest meeting is late on 31 December of `current year − 3` in Helsinki, already 1 January in UTC — or the reverse | The Helsinki year decides (S13) |
| The URL gives the teams in the other order | The two blocks swap; each block's content is unchanged |
| The teams' latest match is against each other | It is in both teams' five, and in `Kohtaamiset` |
| A team's latest five span several competitions | All counted (S5) |
| A team has fewer than five stored matches | That team's block shows the S9 message; the other block is unaffected |
| One team's read fails | That team's block shows `Virettä ei voitu laskea. Yritä myöhemmin uudelleen.`; the other block and the history are unaffected |
| A match decided on penalties | Its score after extra time, as `Kohtaamiset` shows it; a shoot-out is not a result (specs/044) |
| A placeholder team | No page, as specs/042 S8 |
| Signed out | No form value in the HTML and no `Nykyinen vire` (S6, S11); headings per Q12 |
| `/maajoukkueet/huuhkajat`, `/maajoukkueet/helmarit` | Unchanged: no `Nykyinen vire`, no group headings (S10, S12) |

## Performance & Limits

Two indexed reads of at most five rows each, only when signed in and the rivalry
is current. No provider traffic.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, with a meeting in `current year − 2` or later, the head-to-head page on
      `/kotimaa`, `/ulkomaat` and `/maajoukkueet` shows `Nykyinen vire` then
      `Keskinäinen historia`, the latter holding `Yhteenveto`, `Tulokset`,
      `Maalit kilpailuittain` and `Kohtaamiset` in that order, unchanged
- [ ] `Nykyinen vire` shows one block per team, first team first; swapping the
      URL swaps the blocks
- [ ] Each block's five results are the team's five most recent finished matches
      with both scores in any competition of the region, oldest first, each
      linking to its match page
- [ ] Each block's points per match is `(3 × V + T) / 5` over exactly those five,
      one decimal with a decimal comma, and its date is the newest of the five
- [ ] With no meeting in `current year − 2` or later (Helsinki years), there is
      no `Nykyinen vire`, no group heading, and no form read is made
- [ ] A team with fewer than five stored matches shows the Finnish too-few
      message; a failed read shows the error message; the other block is
      unaffected either way
- [ ] Signed out, no form value is in the page's HTML, there is no
      `Nykyinen vire`, and the one sign-in prompt is where specs/044 put it;
      group headings per Q12
- [ ] `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit` are unchanged:
      no `Nykyinen vire` and no group headings
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/form-series.test.ts` | Latest five from one team's side, oldest first; points agree with `formSeries`' last point over the same matches; fewer than five |
| `tests/unit/lib/head-to-head.test.ts` | The three-year rule at its boundary: 1 January of `current year − 2` counts, 31 December of `current year − 3` does not, both in Helsinki time across the UTC year change |
| `tests/unit/lib/match-service.test.ts` | The latest-matches read: newest first, limited to five, finished with both scores only, the region's competitions only; its failure as its own case |
| `tests/unit/components/head-to-head-page.test.tsx` | Groups and sections in order; both blocks, swapped with the URL; the too-few and error messages per team; no group headings for a stale rivalry and no read made; signed out, no form value and no `Nykyinen vire`; the two TASO national-team routes unchanged |
| `tests/integration/match.test.ts` | The latest-matches read against the real schema, home and away, across competitions |
| `tests/e2e/head-to-head.spec.ts` | Signed in, on a real current pair: both blocks, a result linking to a match page, then the history group |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/047-rivalry-page.md` (this file)
- `src/lib/match-service.ts` — the latest-matches read
- `src/lib/form-series.ts` — the latest-five form
- `src/lib/head-to-head.ts` — the three-year rule
- `src/components/head-to-head-page.tsx` — the groups and the form blocks
- `src/components/standings-table.tsx` — only to extract the shared `Vire` letter
- `decisions/047-rivalry-page.md`, by the implementing agent
