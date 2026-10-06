# 530 — One builder for the team panels: decisions

Chore #530 had no record of its own; #531 created this one for a reason cut from
a comment of its code.

## Moved from comments, 2026-10-05

Cut from `src/lib/standings-service.ts` at `55a14fc` by #531.

- **`getTeamPanelMatches`.** Every finished match counts, as in the table's
  `Vire`; the team id is for the log line.

## Moved from comments, 2026-10-06

Cut from `src/components/team-page.tsx` at `94397a8` by #531.

- **`team-page.tsx`.** `/ulkomaat` and `/maajoukkueet` shared one
  implementation and `/kotimaa` had a copy of it, which is how the favourite
  star came to be missing from Finnish clubs alone. There is one page now.
  What differs comes in as `TeamPageView`: the names, the notices, the
  controls, one table column and the analytics loaders. Each provider
  resolves its own view, `competition-team-page.tsx` for football-data and
  the `/kotimaa` route for TASO, and nothing in the page knows which it was
  given.
- **The favourite toggle on the team page.** The heading carries the
  competition and the season too. A favourite whose label cannot be resolved
  would be a star with nothing to say what it is following.
- **The loaders on the team page.** Every panel but the position chart is
  computed from results, which a cup has, and that one decides in its own
  loader whether there is a table to rank in. A team with no matches this
  season already gets a page saying why there is nothing to show.
- **`loadRecords` and `loadComparison` on a failed season lookup.** A database
  failure dressed as a fact about the club is what reporting the outage
  avoids. `not_found` means the club has no stored match under this route.

Cut from `src/lib/team-panels.ts` at `dc74e3e` by #531.

- **`team-panels.ts`.** Each provider's service carried six wrappers of its
  own, twelve near-identical functions: load the team's matches, answer "no
  matches", call a pure function, log a failure. What differs between
  providers is only which matches count: `getTeamPanelMatches` in
  `standings-service.ts` and in `taso-standings-service.ts`, and the whole
  stored history for a national team (`national-team-analytics.ts`). An empty
  list needs no branch of its own, because every pure function answers one as
  the wrappers' "no matches" branches did: no form before the fifth match,
  empty charts, zeroed figures. `tests/unit/lib/team-panels.test.ts` holds
  them to it.
- **`TeamPanelMatches`.** A TASO team that played only in knockout groups has
  no league figures, which is `unavailable`. A failed read is one no panel
  may show as "nothing played".
- **`TeamPanelContext`.** Each provider numbers its teams separately, so 57
  is one club at football-data and another at TASO. A caller adds what places
  it: the competition and the season, as the deleted wrappers logged them.
- **`teamPanelLoaders`.** The gate in `AnalyticsSection` runs before any
  thunk, and the matches are read once however many panels ask. Both
  providers' own loaders catch and log their failures, but nothing obliges
  the next caller to; without the catch here, one rejected read would surface
  as six panels each reporting that it could not be computed.

Cut from `src/app/domestic/team/[id]/page.tsx` at `ef99862` by #531.

- **The Finnish club page.** The file was a copy of the shared page. What
  is left is what TASO does differently: its own context resolver, a season
  that is a plain year, the renamed-competition notice, the `Sarja` column,
  and loaders that take a category and a competition id where football-data
  takes a competition code.
