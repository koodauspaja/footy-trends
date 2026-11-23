# 080 — Daily refresh of every competition: decisions

Feature #828, spec `specs/080-daily-refresh-of-every-competition.md`. Arvauspeli, the predictions log and the settling of guesses read stored rows and never open a competition page, so a fixture the provider added or moved reached them only when someone happened to open that page (#815). Once a day, every competition's current season is now fetched and stored.

| Decision | Why |
|---|---|
| **A step of the hourly `predictions -- log` run, in the run that starts in the 03 hour UTC**, before that run reads its candidates | Miikka chose 03:00 UTC. Inside the hourly run, the step shares its pacers (`providerPacers` in `src/lib/providers/pacer.ts`, which both now take), so the step and the near-kickoff refresh never together exceed football-data's 10 a minute. A second cron service would pace only itself, on the same key. Running first means that same run's refresh, settling and predictions already see what it stored |
| **`isDailyRefreshHour` reads the run's start, `getUTCHours() === 3`** | The run starts on the hour, so the check needs no state. A run that never starts, or crashes before the step, means no refresh that day; nothing catches up on its own (spec, Edge Cases) |
| **`npm run predictions -- refresh` runs the step alone**, with the same summary lines and exit code | Staging has no cron, and a failed 03:00 run otherwise waits a day |
| **The step calls the providers itself, each request through the pacer, and writes with the functions everyone uses**: `getSeasonMatches` and `synchronizeMatches` of each provider, TASO's `getSeasonGroups`, and `storeSeasonGroups` | The spec first said the step would go through the pages' own refresh functions. Those call the providers unpaced, so going through them would put the step's requests beside the hourly run's paced ones. The provider functions are the same the pages call, so the 15-minute response cache still answers a season fetched in the last 15 minutes. The spec was corrected to this before the pull request |
| **`storeSeasonGroups` is cut out of `getSyncedGroupTeams`**, which now calls it | The group write (normalise, carry starting points, sync) had one home, inside the page's refresh. The step needs the write without the page's fetch, and one copy of it keeps the two from drifting |
| **TASO's current season is `resolveTasoSeasonCeiling`'s**, the newest season TASO lists | It is what the season selector tops out at, and it covers a season TASO has published but not started. A season with no matches yet is fetched, stores nothing, and is not a failure. The one before it is past and is not fetched, as a page with that ceiling does not refresh it either |
| **A failed discovery is named but still refreshes the season it fell back to** | The ceiling falls back to the newest stored season, as a page's does. That season may still be the current one, and refreshing it costs one call |
| **football-data's seasons are the active one and, when the competition response lists one, the upcoming one**: `upcomingSeasonId` is added to `getSeasonContext` | Miikka chose to include the upcoming season, so a published fixture list is stored before its opening day. `getSeasonContext` already computed it for the selector |
| **The foreign competitions are `SUPPORTED_COMPETITIONS` whose region is `foreign`** | That is the ten the issue names, and the ten that are predicted. The World Cup and the Euro are `national-teams`, read only by their own pages, and Miikka left the national-team pages out |
| **Every domestic competition gets its group tables, the cups included** | Every domestic page reads them through `classifySeasonGroups`, the knockout cups' match lists included |
| **One `error` line per failure, `Daily refresh of a competition failed`**, with `source`, `code` and `seasonId` | The pages' refresh functions log their own warnings, but the step does not go through them. The spec's Logging section was corrected to this line |
| **A competition's matches and groups are one unit**: if the matches fail, the groups are not fetched, and either failing names the competition-season once | The count is of competition-seasons refreshed, and a half-refreshed one is not refreshed |
| **The run's report gains `daily`**: the count, or null in the hours the step does not run | The printed summary puts `Daily …` first in that hour, and the run's failures list the step's first |

## Measured

On 2026-11-23, `npm run predictions -- refresh` against the real providers, into a scratch database (created, migrated and dropped afterwards):

| Run | Result |
|---|---|
| 20:02 UTC, while production's hourly cron was still using the shared football-data key | `Daily 22 competition-season(s) refreshed`, exit 1. football-data answered 429 for `PD`'s competition and `PPL`'s matches; both were named (`daily football-data PD season`, `daily football-data PPL 2026`), the other 22 stored, and 2 754 foreign matches written |
| 20:22 UTC, nothing else on the key | `Daily 24 competition-season(s) refreshed`, no failure, no 429. All ten foreign competitions' 2026 seasons stored |

TASO already lists 2027 (`spljp27`, `Liigacup27`, `M1LCUP27`) as every domestic competition's current season, and it has no matches yet. Both runs fetched each competition's 2027 matches and groups, one TASO call a second (42 calls in the first run, 28 in the second, whose season discovery came from its cache), stored nothing, and counted that as refreshed. 2026 was not fetched: the spec's case of a published season with no matches, as it happens in November. No upcoming football-data season was listed.

The first run took 131 s. The second's football-data calls stopped twice for minutes, which `pmset -g log` shows were the machine sleeping (20:23–20:25 and 20:26–20:37 UTC), not the step.
