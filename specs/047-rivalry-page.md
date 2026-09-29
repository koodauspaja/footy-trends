# 047 — The rivalry: shared history beside both teams' current form

> **Status: draft, 2026-09-29. Open questions Q1–Q8 below are unanswered — not
> ready for the go.** Written for #355, the last of the matchup features after
> specs/042, specs/044 and specs/045. The live prediction #355 first named was
> split out as #480 on 2026-09-29 and is not part of this spec.

## Summary

The head-to-head page (specs/042, specs/044) says how two teams have fared
against each other. It says nothing about how either is playing **now** — and a
reader looking up a rivalry before the next meeting usually wants both at once:
"KuPS has the better record against HJK, but HJK has won four of its last five."

This puts each team's current form beside the pair's shared history.

Almost everything exists to compose. The history is specs/042 and specs/044;
form is the `Vire` of specs/031, computed by `formSeries` / `teamMatchesInOrder`
in `form-series.ts`. What is new is reading each team's **latest** matches
regardless of which season a page shows, and a page shape that separates *now*
from *history*.

## Scope

### In scope

- Each of the two teams' current form, shown together, for the pair of teams
  (Q1 decides where).
- Splitting the head-to-head page into groups, since form is the first thing on
  it about the present rather than the past (Q2).
- Both providers, each within its own id space (specs/042 S6): a pair is always
  within one source, and so is each team's form.
- Result-level data only — date, competition, home/away, final score. No new
  column and no provider request.

### Out of scope

- The live prediction — #480, blocked on a prediction model (#343, #344, #345).
- Any change to what `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain` or
  `Kohtaamiset` compute or show (specs/042, specs/044). They may move into a
  group (Q2); their content is unchanged.
- Upcoming fixtures between the pair (specs/042 S12 left them off; this keeps
  that).
- New ways to reach the page. Still only from a match page (specs/042 S1).
- Changes to the team page's `Vire otteluittain` chart (specs/031).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Providers | **Each team's form is read within the pair's own source** | specs/042 S6. A team is only identified within one provider, and the pair already is. |
| S2 | What "form" measures | **Points from the last five finished matches, `(3 × V + T) / 5`, and the five results themselves** | The standings table's `Vire` and specs/031's chart already mean this; a third definition of form on the site would disagree with both. `FORM_WINDOW` stays 5. Which five matches is Q3. |

## Open questions

Each carries a recommendation; none is decided until answered in chat.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **A new page, or new sections on the head-to-head page?** | (a) New sections on `…/kohtaamiset/:a/:b`. (b) A new route, e.g. `…/kilpailu/:a/:b` (`rivalry`), linking to and from the head-to-head page | **(a).** The head-to-head page already *is* "a specific rivalry", is already reached from every match page, and already names both teams in the URL. A second page for the same pair would split a reader's question in two and duplicate the five routes. |
| Q2 | **How the page is grouped, and in what order** | (a) Two groups, `Nyt` (form) above `Historia` (`Yhteenveto`, `Tulokset`, `Maalit kilpailuittain`, `Kohtaamiset`). (b) The same two groups, history first. (c) No groups; one new `Vire` section after `Yhteenveto` | **(a),** with the group names to be chosen here — candidates `Nykyinen vire` / `Keskinäinen historia`. Form is the shorter block and the more time-sensitive one, so it reads first; `Yhteenveto` then opens the history. Group headings are `h2` and the existing sections become `h3`, as `Analyysit` does on the team page (#424). |
| Q3 | **Which matches make "current" form** | (a) Each team's last five finished matches in **any** competition of the region — the head-to-head's scope (specs/042 S2). (b) The last five in each team's **current league season** only — exactly the standings `Vire` (specs/031's scope: table matches, no cups, no playoffs) | **(a).** The page already mixes competitions, and "how are they playing now" includes last week's cup tie. But (a) means the figure can differ from the standings `Vire` for the same team, which (b) never does — say which matters more. |
| Q4 | **Signed-in only?** | (a) Behind `canSeeAnalytics()`, one sign-in prompt for all gated content on the page (as specs/044 S6). (b) Public, like `Yhteenveto` | **(a).** Form is an analytics panel everywhere else on the site (specs/031). If Q2 is (a), the signed-out page shows `Historia` with its public sections and one `Kirjaudu sisään nähdäksesi analyysit ja trendit.` — to be decided whether that prompt sits once (where?) or once per group. |
| Q5 | **What each team's form shows** | (a) The five results as `V`/`T`/`H` letters, newest last as the `Vire` column does, each linking to its match page, plus points per match (`2,2`) and the date of the latest match. (b) Both teams' `Vire otteluittain` lines on one chart. (c) Both | **(a).** Compact, legible at 375 px, checkable against the match pages, and a reader already knows the letters from the standings table. A chart of two lines needs a common x-axis the two teams do not share (different match dates). |
| Q6 | **Stale form** — a team whose latest stored match was long ago (relegated out of stored competitions, season break, a national team between windows) | (a) Always show the last five, with the latest date visible so the reader judges. (b) Show nothing beyond a cutoff (e.g. no match in 365 days) with a message. (c) Only matches of the current season | **Needs your call.** (a) is honest but can present a 2019 run as "current"; (b) needs a cutoff number I should not invent. |
| Q7 | **Fewer than five stored matches** | (a) The specs/031 message, `Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.`, for that team. (b) Show the results there are, with points per match over them | **(a),** to stay one definition of form (S2) — but specs/031 wrote it per *season*; under Q3 (a) this only happens for a team with fewer than five stored matches in total. |
| Q8 | **Which routes** | (a) All five head-to-head routes. (b) Not the two TASO national-team routes (`/maajoukkueet/huuhkajat`, `/maajoukkueet/helmarit`) | **(b), unless you know otherwise.** specs/045 S5: TASO has no stable id for Finland across categories (`FINLAND_TEAM_ID` is a sentinel) and an opponent's id varies by category, so "Finland's last five" is not one query. football-data's `/maajoukkueet` (World Cup, Euro) has stable country ids and would keep it, though Q6 bites hard there: a country's latest stored match may be the last tournament. |

## UX / UI (Finnish strings)

**Pending Q1, Q2, Q4, Q5.** Under the recommended answers, signed in:

1. `Nykyinen vire` *(group, name pending Q2)*
   - One block per team, first team first (the URL's order, as `Yhteenveto`):
     team name, then `V V T H V` linking each result to its match, then
     `2,2 pistettä ottelua kohden`, then `Viimeisin ottelu 21.9.2026`.
2. `Keskinäinen historia` *(group, name pending Q2)*
   - `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain`, `Kohtaamiset` — unchanged.

Reused strings: `Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.`
(Q7), `Virettä ei voitu laskea. Yritä myöhemmin uudelleen.` (a failed read, the
panel convention), `Kirjaudu sisään nähdäksesi analyysit ja trendit.` (Q4).

Each letter carries the same `title` the standings `Vire` column gives it (the
match, its score), so a reader can tell the five apart without following links.

## API & Data

**No provider request, no new column.**

| Needed | Where |
|---|---|
| The pair's history | `getHeadToHeadHistory`, unchanged |
| Each team's latest finished matches | **New read**: the team's finished matches with both scores, newest first, limited to `FORM_WINDOW`, with the predicates Q3 names. Under Q3 (a) this is `getWorstOpponents`' read (specs/045) with an order and a limit |
| The form value | `formSeries`'s arithmetic over those five — or a small pure helper beside it, so both agree by construction (S2) |
| The letter and its title | The standings `Vire` column's formatting, extracted so both spell it the same way |
| Signed in | `canSeeAnalytics()`, asked before the read (Q4) |

**Caching:** none, as specs/031–045. Two indexed reads of five rows each.

## Edge Cases

Only the cases whose behaviour does not depend on an open question are stated.
The rest are Q3, Q6, Q7 and Q8, and get written here once answered.

| Case | Behaviour |
|---|---|
| The URL gives the teams in the other order | The two form blocks swap places; each block's contents are unchanged |
| The two teams' latest match is against each other | It appears in both teams' five, and in `Kohtaamiset` |
| A match decided on penalties | Its score after extra time, as `Kohtaamiset` shows it; a shoot-out is not a result (specs/044) |
| One team's read fails | That team's block shows the error message; the other team's block and the history are unaffected |
| A placeholder team | No page, as specs/042 S8 |
| Signed out | Depends on Q4 — under (a), no form value appears in the HTML, as specs/044 S6 |

## Performance & Limits

Two indexed reads of at most five rows each, added to the page's existing reads.
No provider traffic.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

Drafted against the recommendations; revised once the open questions are
answered.

- [ ] Signed in, the head-to-head page shows both teams' current form, first
      team first, above the pair's history
- [ ] Each team's five results are its five most recent finished matches in the
      scope Q3 names, newest last, each linking to its match page
- [ ] Each team's points per match is `(3 × V + T) / 5` over exactly those five,
      one decimal with a decimal comma
- [ ] The history sections are unchanged in content, and grouped as Q2 decides
- [ ] Signed out, no form value is in the page's HTML (Q4)
- [ ] The stale-form and too-few cases behave as Q6 and Q7 decide
- [ ] The routes Q8 excludes are unchanged
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/form-series.test.ts` (or `head-to-head.test.ts`) | Latest five from one team's side; the points arithmetic agrees with `formSeries`' last point; fewer than five |
| `tests/unit/lib/match-service.test.ts` | The latest-matches read: newest first, limited, finished with both scores only, in Q3's scope; its failure as its own case |
| `tests/unit/components/head-to-head-page.test.tsx` | The groups and sections in order; both form blocks, swapped with the URL; one team's read failing; signed out, no form value; the excluded routes (Q8) |
| `tests/integration/match.test.ts` | The latest-matches read against the real schema, both home and away |
| `tests/e2e/head-to-head.spec.ts` | Signed in, on a real pair: both form blocks, each result linking to a match page, then the history |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/047-rivalry-page.md` (this file)
- `src/lib/match-service.ts` — the latest-matches read
- `src/lib/form-series.ts` — the latest-five form, if not a reuse
- `src/components/head-to-head-page.tsx` — the groups and the form blocks
- `src/components/standings-table.tsx` — only to extract the shared `Vire` letter
- `decisions/047-rivalry-page.md`, by the implementing agent
