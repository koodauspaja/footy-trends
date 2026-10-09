# 303 — Terms of service, and the providers' credit: decisions

Chore #303 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/site-footer.tsx` at `ef99862` by #531.

- **The providers' credit.** football-data.org's free tier asks for it in
  "a visible section of your application or website", so it is not on the
  terms page alone. In Finnish, because CLAUDE.md admits no exceptions and
  their requirement is a credit and not a fixed string. Both providers appear
  on `/maajoukkueet`, where the tournaments are football-data's and the
  Finnish teams' own match lists are Palloliitto's, and a single footer line
  cannot draw that boundary without getting it wrong, which it did twice.

Cut from `src/app/terms/page.tsx` at `48ebab4` by #531.

- **`/kayttoehdot`.** Google requires both documents reachable without
  signing in before an OAuth consent screen can leave Testing. The page
  claims no licence because football-data.org's free tier is a published
  permission the app meets, while the TASO arrangement is an open question
  recorded on #303. Asserting a permission that has not been established
  would be worse than saying nothing.

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/terms/page.test.tsx` at `c12c30a` by #531.

- **What the terms page's tests were corrected for.** The first version of
  the page credited football-data.org with the national teams;
  `national-team.ts` says otherwise. Review caught the refresh wording: a
  season that has ended but is still the newest keeps refreshing on the
  interval, so "päättyneen kauden" claimed a limit the app does not have.
  A stem list built from `luvalla` alone lets "Meillä on lupa" straight
  through, and exact strings would miss `luvan`, `lisenssin` and
  `sopimuksella`.
