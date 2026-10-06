# 042 — The full head-to-head between two teams: decisions

Implementation notes for `specs/042-head-to-head-view.md` (#336). The spec says
what the page shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**The page describes exactly the matches it lists.** Its count, its record, its
goals and both ground lines are computed from one array, and the link that leads
to it carries the length of that same array. A summary that disagrees with the
rows beneath it is the failure this page is most able to commit, and most of
what follows is that rule applied somewhere.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The labelling | **Extracted** to `src/lib/meeting-labels.ts`, shared with the match page | Both pages ask "which competition was that meeting", and the column exists because the answer is not obvious from the row — TASO's `group_name` says `5. Kierros`, which reads as a league round. Two copies would be two answers. The extraction is a move, not a rewrite: the match page's own tests pass untouched. |
| The record | Pure, in `head-to-head.ts`, over a structural `Meeting` | The arithmetic is identical whichever table the row came from, so naming either row type would make the other a cast — the reason `form-series.ts` takes `ResultMatch`. |
| An empty history | `headToHeadRecord` returns **`null`**, not zeroes | `0 ottelua, NaN–NaN` is what zeroes render as. A record of nothing is not a record. |
| Both ground lines | Read from **whoever hosted**, so the two add up to every meeting | S9 asks for two home records rather than a home and an away, because a reader comparing them is comparing two teams at home. Asserted directly: the two lines summed equal `played`. |
| The count on the link | Taken from **the same read the page performs** | A `count()` query would be cheaper and would be a second query able to answer differently. `(24)` on the link has to be 24 rows behind it, and this is the only way that cannot drift. |
| The match page's five | **Taken from that same read**, not a query of their own | The first version kept the match page's own `LIMIT 5` query and ran the full history beside it for the count — two head-to-head reads on every match page, one of them only for a number (Sourcery, on this pull request). Now the match page reads the history once: the five are the meetings strictly before its kickoff, and the count is the history's length. The history's order is the old query's order and its scope is the old query's scope, so the five are the same five; the existing integration tests for them pass unchanged through the new path. |
| The link's absence | No link for a placeholder team, and none when the pair has no meeting | The block above already says the meetings cannot be shown; a link to a page about a team that does not exist yet says the opposite. |
| `1 ottelu` | `matchCountLabel`, not a literal | Finnish counts one thing differently. The first version hardcoded `ottelua` and a test enshrined `1 ottelua` before the helper was found. |
| Five routes, not three | Head-to-head pages for `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit` too | Every match page builds its link as `${basePath}/kohtaamiset/...`, and those two routes have their own prefix — so the link on Finland's own match pages would have 404ed. Found by chasing a coverage gap: the `nationalTeam` option existed and nothing reached it. |
| The link's own rule | `meetingsLink` in `head-to-head.ts`, not inline in the page | Both reasons for showing no link — a read that failed, and a pair with nothing to open — belong with the href they suppress, and a pure function is reachable by a test directly rather than through a re-imported page. |
| Narrowing the goals | Through `toFinishedMatches` at the call site | The query already filters both columns; this is where the *type* learns it, using the helper every other caller uses rather than a second rule. |

## What the tests prove, and how

- **The summary reconciles with its list**, in three places: the record sums to
  `played`, the two ground lines sum to `played`, and the e2e reads the count
  out of the page's own line and asserts that many rows.
- **The URL's order decides whose record it is** — the same meetings read the
  other way round give mirrored wins, losses and goals.
- **The three differences from the match page** are asserted separately: no
  anchor (a meeting played after the linked match appears), no limit (eight
  rows where the match page shows five), and no exclusion.
- **Thirteen mutations, all caught.** Ten by the unit suite: the record ignoring
  which side the first team was on, goals never mirroring, both ground lines
  counted against one team, an empty history returning zeroes, a draw counted as
  a win, the page ignoring the URL's order, the link offered with nothing behind
  it, and the link offered for a placeholder team. Two by integration: the limit
  coming back, and a team allowed a history against itself.

### The page reached for the provider, and CI caught it

The first version resolved `spansCalendarYears` through `getSeasonContext`,
to choose between `2023/24` and `2026` in the window sentence. That is a
provider request, on a page whose spec promises none — and it passed locally
while timing out on CI, where there is no API key.

It is decided from the region now, which is what the distinction actually is:
the foreign competitions are leagues played across a winter and the
national-team ones are tournaments played inside one summer. TASO ignores the
flag entirely. **`@/lib/football-data` is deliberately not mocked** in the page
tests, so a future reach for a provider hangs rather than quietly passing.

### Dead code the coverage gate found

`Summary` guarded against `record === null`, which cannot happen: a view exists
only when the pair has a meeting, and a meeting is what the record needs. The
guard was removed rather than tested — `View.record` is non-nullable now, and
`buildView` returns `null` once for both reasons instead of twice. The Finnish
string for that state went with it, since nothing could ever render it.

### An order dependency the shuffled run found

The new `describe` for the link sat beside the block that owns the file's
`beforeEach` rather than inside it, so a shuffled run inherited whichever
fixture ran last — the placeholder match, which made the link vanish for the
wrong reason and the test pass for the wrong reason too. It has its own setup
now.

### Three mutations escaped the unit suite first time

The limit and the self-pairing guard are enforced in SQL, so only the
integration suite can see them — which is where their tests are, and both
mutations fail there. The third was a real gap: nothing asserted that a
placeholder team suppresses the *link*, only that it suppresses the block above
it. That test exists now, and the mutation fails it.

## Looked at, rather than inferred

Driven through the real app at 375 px, light and dark, from
`/kotimaa/ottelut` → a match → the link → the page. `FC Inter – VPS`,
14 meetings from 2015 to 2026, and the figures reconcile by hand: 7 + 5 + 2 =
14 played, and the two ground lines (2 + 4 + 1) + (1 + 1 + 5) = 14 as well.

**One thing that looked like a defect and was not.** At 375 px the table shows
`Pvm` and `Ottelu` and appears to lose `Tulos` and `Kilpailu`. Measured rather
than assumed: the document does not overflow (`scrollWidth` 375 =
`clientWidth` 375) and the table is 584 px wide inside a scrolling container —
exactly as it is on the match page, the team page and the matches list, which
all measure 584 too. The rendered header really is
`["Pvm","Ottelu","Tulos","Kilpailu"]` with `1–0` and `Veikkausliiga` in the
first row. Nothing was changed for it.

## Left open, deliberately

- **No opponent list and no picker.** S1 makes the match page the only way in,
  which reaches every pair that has a history. A pairing that has never met has
  no route, and the page says `Kohtaamisia ei löytynyt.` for a hand-typed URL.
- **Fixtures still to come are absent** (S12). The match page a reader arrives
  from already carries the fixture they were looking at, and a fixture list and
  a record are different claims. #333, #337 and #338 sit on this page's data.

## Moved from comments, 2026-10-06

Cut from `src/lib/head-to-head.ts` at `a86c1cb` by #531.

- **`Meeting`.** Structural, not one of the two row types, as `form-series.ts`
  takes `ResultMatch`: the arithmetic is the same whichever table the row came
  from, and naming one would make the other a cast.
- **`HeadToHeadRecord`.** Two home lines, not one home and one away: a reader
  comparing them is comparing two teams at home, which is the question a
  rivalry's ground record asks.
- **`headToHeadRecord`.** It counts only what it is handed: finished meetings
  with both scores stored, across every competition in the region, so a
  fixture still to come cannot reach it. `null` for no meetings because a
  record of nothing is not a record, and a caller rendering
  `0 ottelua, NaN–NaN` is what makes zeroes worse than nothing.
- **`meetingsLinkCount`.** Two reasons for the same answer, decided in one
  place: a `null` count is a read that failed, and a link promising a number
  it does not have is worse than no link; a count of zero is a pair with
  nothing to open, where the block above already shows everything.
- **`meetingsLink`.** The href sits beside the rule that decides whether to
  show it, so a caller cannot build one for a pair with nothing behind it, and
  a test reaches both directly.

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`PreviousMeetings`.** `total` is the row count of the page the link leads
  to, not a second query able to disagree with it, and a match page costs one
  head-to-head query, not two.
- **`getHeadToHeadHistory`.** Three differences from the match page's block,
  each a decision. No anchor: the match page takes only meetings before its
  own kickoff, as context for that fixture, while a history of the pair is
  not about one fixture. No limit: `HEAD_TO_HEAD_LIMIT` is a choice about the
  match page. No exclusion of the match linked from, which is one of the
  meetings. What does not differ is the scope and which matches count: every
  competition in the region, finished, both scores stored.
