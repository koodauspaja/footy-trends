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
