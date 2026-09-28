# 042 — The full head-to-head between two teams

> **Status: all questions answered in chat on 2026-09-28, awaiting the go.**
> Written for #336, the first of the matchup features (#333, #337, #338, #355).

## Summary

A match page already lists the five most recent meetings between its two teams
and a sentence saying how far back it looked. This gives those meetings a page
of their own: **every** stored meeting, not five, with a summary of the record.

Almost all of it exists. `getMatchPageData` finds the meetings, `head-to-head.ts`
states the window, and the query already spans every competition in a region.
What is new is a page to put them on, a route that names two teams rather than
one match, and a summary — which nothing computes today.

## Scope

### In scope

- A page per **pair of teams**, in all three regions, reached from a match page.
- **Two sections, in this order** (S11): a summary of the record, then the
  meetings themselves.
- Every stored meeting between them, newest first, each naming its competition.
- Both providers, each within its own id space.

### Out of scope

- **Reaching the page any other way.** No opponent list on the team page and no
  picker of its own (S1). Both were considered and are a later feature if
  wanted.
- **A pairing that has never met.** There is no route to one: the way in is a
  match between them, so a pair with no match has no page. That is a
  consequence of S1 rather than a rule of its own.
- Anything computed *from* the meetings beyond the record — form, bogey-team
  scoring, score frequencies, goal averages. Those are #333, #337 and #338, and
  they sit on this page's data once it exists.
- Changing the five-meeting block on the match page, beyond adding the link.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | The way in | **A link on the match page**, under the existing `Aiemmat kohtaamiset` block | Miikka, 2026-09-28. Every pair that has ever met has a match page, so this reaches every pair that has a history to show — it is not the limitation it looks like. It needs no picker and no navigation entry, and it puts the link exactly where a reader is already asking the question. |
| S2 | Which competitions | **All of them, in one history and one summary**, each row naming its own | Miikka, 2026-09-28. It is what the existing query already does — `head-to-head.ts` says the span is deliberate, so a World Cup page can list a European Championship meeting. specs/040 S1 separated competitions for per-season **rates**, where a six-match cup run folded into a 27-match league average describes neither; a count of meetings has no such problem. |
| S3 | Which matches count | Finished, with both scores stored, excluding the match linked from | The existing query's rule, unchanged. A fixture with no result contributes nothing to a record. |
| S11 | The page's shape | **`Yhteenveto` then `Kohtaamiset`**, two named sections | Miikka, 2026-09-28: *"i want that head-to-head page be clear"*. A summary block sitting on top of an unnamed list leaves a reader to work out what each part is; naming both says it. |
| S12 | Meetings still to come | **Not shown.** This page is history | Miikka, 2026-09-28: *"it's ok not to have them for this history focused page"*. A fixture list and a record are different claims, and the match page a reader arrives from already carries the fixture they were looking at. Worth stating rather than leaving implicit, because S4 reads as if it were about the future and is not. |
| S4 | The anchor | **Dropped.** The page shows every meeting, including ones after the linked match | The match page's query takes only meetings *before* its own kickoff, because it is context for that fixture. A history of the pair is not about one fixture, so the newest meeting belongs in it. |
| S5 | The limit | **Dropped.** `HEAD_TO_HEAD_LIMIT` stays as the match page's five | `head-to-head.ts` already notes the data supports more. The limit is a choice about the match page, not about the data. |
| S6 | Pairs across providers | **Not possible, and not attempted** | football-data and TASO keep separate id spaces and separate competition registries, so a "team" is only identified within one of them. A pair is always within one source. |
| S7 | The window sentence | Reused unchanged | `headToHeadWindowSentence` already says `Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.`, and its wording was chosen precisely because a count of meetings otherwise reads as a fact about the teams rather than about our data. It is more necessary here, not less: this page claims completeness. |
| S9 | What the summary says | **The record, the goals and a home/away split** | Miikka, 2026-09-28. Everything the meetings can say without a new computation. The home/away split is often the real story of a rivalry, and it is the part a reader cannot get from the list by eye. |
| S10 | What the link says | **`Kaikki kohtaamiset (24)`**, with the count | Miikka, 2026-09-28. With five shown, the count *is* the argument for following the link — and `(5)` quietly says there is nothing more. The number comes from the same query, so it cannot disagree with the page it leads to. |
| S8 | A placeholder team | No page, and no link offered | `hasPlaceholderTeam` already answers `unavailable` for a bracket slot like the winner of a semi-final. There are no two teams yet to have a history. |

## API & Data

**No new endpoint, no new column, no provider request.** The same two tables the
match page already queries, with the anchor and the limit removed.

| Needed | Already there |
|---|---|
| The meetings | `footballDataHeadToHead` / `tasoHeadToHead` in `match-service.ts` |
| How far back the search reached | `headToHeadWindow`, `headToHeadWindowSentence` |
| A bracket slot with no team | `hasPlaceholderTeam` |
| Which competitions a region holds | `competitionsInRegion`, `tasoBucketPredicate` |
| The record | **Nothing. This is the new computation** |

**Caching:** none, as specs/031–041.

## UX / UI (Finnish strings)

The route, following the existing rewrites in `next.config.ts`:

```
/kotimaa/kohtaamiset/:a/:b                 -> /domestic/head-to-head/:a/:b
/ulkomaat/kohtaamiset/:a/:b                -> /foreign/head-to-head/:a/:b
/maajoukkueet/kohtaamiset/:a/:b            -> /national-teams/head-to-head/:a/:b
/maajoukkueet/huuhkajat/kohtaamiset/:a/:b  -> /national-teams/mens-team/head-to-head/:a/:b
/maajoukkueet/helmarit/kohtaamiset/:a/:b   -> /national-teams/womens-team/head-to-head/:a/:b
```

**Five, not the three this spec first named.** Every match page builds its link
as `${basePath}/kohtaamiset/...`, and the two national-team routes have their
own prefixes — `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit`. Without
their own pages, the link on Finland's own match pages would lead nowhere. They
are TASO's rather than football-data's, and name their competitions through
`nationalTeam`, exactly as those match pages already do.

**Q1 and Q2 below are the two strings this feature adds.** Everything else —
the match list table, the window sentence, the error and empty messages — is
reused.

**Four new strings**, all settled (S9, S10). Everything else — the match list
table, the window sentence, the error and empty messages — is reused.

| Element | Content |
|---|---|
| Heading | `Kohtaamiset: HJK – KuPS`, the teams in the order the URL gives them |
| `Yhteenveto` | The section heading over the record |
| Span | `24 ottelua, 1998–2025` — the count and the years it covers |
| Record | `HJK 11 – 6 tasan – 7 KuPS` |
| Goals | `Maalit 38 – 31`, the first team's first |
| Home and away | `HJK kotona 8 – 3 – 1` and `KuPS kotona 3 – 3 – 6`, each a win–draw–loss from that ground's home side |
| `Kohtaamiset` | The section heading over the meetings |
| The list | Every meeting, newest first: date, competition, teams, score. The same `MatchListTable` the team pages use, with `Kilpailu` as its fourth column |
| Window sentence | `Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.` (unchanged), under `Kohtaamiset` — it describes how far *back* we looked, so it belongs with the past |
| The link that leads here | `Kaikki kohtaamiset (24)`, under `Aiemmat kohtaamiset` on the match page |

## Edge cases

| Case | Behaviour |
|---|---|
| The pair has met once | The page renders: one row, and a summary of one match |
| The pair's only meetings are unfinished | Treated as no meetings — S3. The page says so rather than showing an empty summary |
| A meeting was played after the match linked from | It appears in the list like any other (S4). It is history, not a fixture: the pair met again since |
| One id is not a team in this region | Not found, the same shape the team page uses for an unknown id |
| The two ids are the same team | Not found. A team has no history against itself |
| The ids are given in the other order | The same history, with the heading and summary following the URL's order |
| A meeting was played at a neutral venue | Counted as it is stored — home and away are the provider's, and this feature does not reinterpret them |
| The linked match is itself finished | It appears in the list like any other meeting (S4) |

## Performance & limits

One query per page, on the same indexed columns the match page already filters.
The deepest pair measured in `head-to-head.ts` is 35 meetings in Veikkausliiga,
so removing the limit of five changes the row count by an order of magnitude and
nothing else.

## Security & secrets

No new environment variable and no new secret. Public, like the match pages it
is reached from: nothing here is behind `canSeeAnalytics()`.

## Acceptance criteria

- [ ] Every match page links to the full head-to-head for its two teams —
      all three regions, and the two national-team routes that have their own
      prefix
- [ ] The page lists **every** stored meeting, not five, newest first
- [ ] Each row names its own competition, and meetings from different
      competitions appear in one list (S2)
- [ ] The summary describes exactly the matches listed — its count, its record,
      its goals and both home/away lines add up to the rows below it
- [ ] The two home/away lines together account for every meeting
- [ ] The link carries the number of meetings, and that number is the number of
      rows the page then shows
- [ ] The page reads `Yhteenveto` then `Kohtaamiset`, each a section a reader
      can name without reading its contents
- [ ] No unplayed fixture appears anywhere on the page
- [ ] A meeting played after the linked match is included (S4)
- [ ] Only finished meetings with both scores count, toward the list and the
      summary alike
- [ ] The window sentence is shown, and says the same thing the match page says
- [ ] A match with a placeholder team offers no link and has no page
- [ ] The same pair in either URL order gives the same history
- [ ] `HEAD_TO_HEAD_LIMIT` still governs the match page, which is unchanged
      apart from the link
- [ ] Correct in light and dark, and legible at 375 px
- [ ] No provider request is made

## Tests required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/head-to-head.test.ts` | The record counts wins, draws and losses from the first team's side over mixed competitions; the goals are that side's first; each home/away line is read from that ground's home side, and the two together account for every meeting; an unfinished meeting contributes nothing |
| `tests/unit/lib/match-service.test.ts` | The unanchored read returns every meeting including ones after the linked match, and is not capped at five; an unplayed fixture between the pair is returned by neither |
| `tests/unit/app/**/head-to-head/page.test.tsx` | Each region renders; an unknown id, a self-pairing and a placeholder team are not found |
| `tests/unit/components/match-page.test.tsx` | The link is offered, and is absent for a placeholder team |
| `tests/e2e/head-to-head.spec.ts` | From a real match page, the link opens a history longer than five, mixing competitions, with the window sentence; the two sections appear in order |
| `tests/integration/head-to-head.test.ts` | The query returns both teams' home and away meetings from the real schema |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files to update

- `specs/042-head-to-head-view.md` (this file)
- `next.config.ts` — three rewrites
- `src/app/{domestic,foreign,national-teams}/head-to-head/[a]/[b]/page.tsx`
- `src/lib/match-service.ts` — the unanchored, unlimited read
- `src/lib/head-to-head.ts` — the record
- `src/components/match-page.tsx` — the link
- `decisions/042-head-to-head-view.md`, written by the implementing agent

## Open questions

**None.** Q1 and Q2 were answered in chat on 2026-09-28 and are recorded as S9
and S10; the page's two sections, and leaving fixtures off it, were settled the
same day and are S11 and S12.
