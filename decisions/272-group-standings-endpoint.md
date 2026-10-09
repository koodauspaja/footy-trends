# 272 — Group standings from an endpoint TASO still serves: decisions

Bug #272 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`getSeasonGroups`.** TASO answers `getGroups` with
  `{"status":"error","error":"Not allowed"}` for every category and season
  tried, including ones already held, while `getCategories` with the same key
  and headers returns 200: the endpoint, not the credential. Driving
  tulospalvelu.palloliitto.fi through a browser and capturing every
  `taso/rest` request shows the site never calls `getGroups`; it reads
  standings from `getCategory`.
- **Why it went unseen.** `getSyncedGroupTeams` falls back to stored rows, so
  groups already synced kept rendering their last numbers and only a new group
  showed it: a split round opened at zero while finished seasons looked fine.
- **`CategoryResponse`.** The team rows carry the same field names either way;
  only the nesting differs, with the groups under `category` where `getGroups`
  had them at the top level.

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`CARRY_OVER_CONFIG`, the 2026 splits.** Ykkönen's and Veikkausliiga's were
  added together when the splits began. For Veikkausliiga, TASO reports
  `starting_points` 0 for both groups while `points` already includes
  Runkosarja: KuPS 43 from 22 played, with none of those 22 in Mestaruussarja
  itself. Ykkönen's −3 is the `seeded: false` convention doing its other job.
- **The log level in `getSyncedGroupTeams`.** It was a warning, on the
  reasoning that stale standings are survivable. What is not is nothing being
  stored: every table in the group then renders as zeros, which looks like a
  result. That is how the refused endpoint stayed invisible for months.
  `stored` carries the count so the two cases stay tellable apart without a
  second severity, and so without a branch only a contrived test reaches.
