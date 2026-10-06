# 047 — The rivalry: decisions

Implementation notes for `specs/047-rivalry-page.md` (#355). The spec says what
the page shows; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The form value | `latestForm` in `form-series.ts`, sharing `formSeries`' points rule | S2: one definition of form. A unit test asserts `latestForm`'s points equal `formSeries`' last point over the same matches. |
| The letter and its title | `resultFor` and `formResultLabel` exported from `standings.ts` | The spec's "extracted so both spell it the same way". The standings table builds its titles through `formResultLabel` too now, so the two cannot drift. |
| The read | `latestTeamMatches`, sharing `WHERE` clauses with specs/045's `teamHistory` | S5 names bogey teams' predicates. Each provider's clause is now one function both reads call, so "a team's matches" means the same thing in both; only the select plumbing appears twice, with a `LIMIT` on the new one. |
| A failed read | `TeamForm` carries `error` as its own case | A failure never shares a value with "too few" (the self-review's failure-path class). Each block reads its own team, so one failing leaves the other and the history untouched. |
| The three-year rule | `isCurrentRivalry(latest, today)` in `head-to-head.ts`, over `playedYear` | S13's Helsinki calendar is `playedYear`'s, which the national-team pages already group by. `today` is a parameter so the boundary is testable; the page passes `new Date()`. |
| No read for a stale rivalry | The rule is checked before either form read | The spec's acceptance criterion; asserted by a test that counts `getTeamForm` calls. |
| Heading levels | `h2` unless the groups are shown, then `h3` under them | S12: the groups appear only together, so the level is decided once, from whether there is form, and passed to every section. |
| The latest match's date | `matchDateFormatter`, the `Kohtaamiset` list's own | S15, asked at the start of implementation. |

## What the tests prove, and how

- **Eighteen mutations on the TypeScript, all caught**: the first five rather
  than the latest, newest first, the divisor, the title, the side, the date, the
  rule's boundary and its clock, form on a national route, the stale check, the
  block order, the link, the title attribute, the heading levels, the group
  order, the points line, the date format and the too-few message.
- **Two SQL clauses cannot fail alone, by design.** Dropping the `LIMIT` still
  yields the same five, because `latestForm` takes the last five of whatever it
  is given; dropping the status filter still excludes an in-progress match,
  because `toFinishedMatches` checks `FINISHED` again. The integration test
  pins the behaviour — five, finished only — whichever layer enforces it. The
  bucket and orientation clauses are the shared ones specs/045 already
  mutation-tested.
- **The page's specs/042 and 044 tests run in 2030**, where their 2024–2025
  fixtures are a rivalry no longer played, so they keep asserting the page as
  those specs made it; specs/047's tests set 2026-09-29.
- **Two e2e tests changed**: specs/044's signed-in cases on FC Inter v AC Oulu
  now find the history's sections as `h3` under `Keskinäinen historia` — that
  pair met in 2026, so the page is grouped.

## Verified against live data

FC Inter v AC Oulu, signed in: FC Inter `V V H V V`, 2,4 per match; AC Oulu
`V T H H H`, 0,8; both last played 18.09.2026 — each other, the meeting
`Kohtaamiset` lists first. A result link opens that match's page. Screenshots at
375 px in light and dark, and 1280 px; the page does not scroll sideways.

## Moved from comments, 2026-10-06

Cut from `src/lib/head-to-head.ts` at `a86c1cb` by #531.

- **`isCurrentRivalry`.** In 2026 a 2024 meeting counts and any 2023 one does
  not. Both years are Helsinki's, as `playedYear` reads every date on the
  site, so a late kick-off on 31 December is not filed under the next year
  because UTC has already turned. `today` is a parameter so the rule is
  testable at its boundary.

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`footballDataTeamMatches`, `tasoTeamMatches`.** Shared by the full history
  and the latest five, so an opponent's meetings and a team's current form
  count the same matches.
- **`TeamForm`.** A failed read is its own case, never "too few matches".
