# 678 — A season refresh's older snapshot may be written last: decisions

Chore #678. Two requests can refresh the same season at once. Each fetches its
own provider snapshot and writes it, and the write that lands last wins, even
when it holds the older snapshot. Records 063 and 628 accepted that outcome
and cited `decisions/196-concurrent-group-syncs.md` for it, but 196 decides
something else: the upsert that lets two syncs on a cold table both succeed.
This record is where the decision lives. Left to Claude's judgement by Miikka,
2026-10-20: "the whole situation is extremely rare, so i'll trust your instinct
on these decisions".

| Decision | Why |
|---|---|
| Accepted, for football-data's `synchronizeMatches` | It upserts each match and deletes none, so an older snapshot written last puts back the older status and score of the matches both snapshots hold. Its write stamps `updated_at` with the time of writing, so `needsRefresh` treats those rows as fresh for one interval: `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS`, 3600 in both environments. The next refresh after that replaces them. |
| Accepted, for TASO's `synchronizeMatches` | The same upsert, and the same bound with TASO's interval, `CURRENT_SEASON_CACHE_TTL_SECONDS`, 15 minutes. |
| Accepted, for TASO's `synchronizeGroupTeams` and the zone levels it writes through `replaceGroupLevels` | Both delete the season's rows and insert the snapshot's in one transaction. On a warm table the second sync's delete waits on the first's row locks and then replaces its rows whole, so the sync that reaches the delete last decides the table and its levels until the next refresh, 15 minutes later. |
| Why it is rare | Both requests must find the season past `needsRefresh` before either has written, so both start within one provider request of each other after the interval runs out, and the older response must reach the database after the newer one. Between a response arriving and its write there is only normalising and one statement or transaction, so the two writes must interleave within milliseconds. |
| Where it could outlast the next refresh | Only if the season stopped being active before its next refresh: `needsRefresh` never refreshes a past season. The active season changes weeks or months after a season's last match, when two snapshots of it no longer differ, and the forced refresh (decisions/029) rewrites a stored past season. |
| No per-season lock around the fetch and the write | The lock would be held across a provider request, which can back off for up to 35 seconds on a rate limit (decisions/197). A sync that waits on it counts the wait toward its 10-second statement timeout (decisions/665), so a wait past that fails, and a try-lock that skips the refresh holds a database connection for the length of a provider request, on every refresh path: the page, the forced refresh and the backfill. #630 grew a lock in this code and removed it again (decisions/628, "How it got here"). |
| No "the newest fetch wins" upsert | It needs a fetch time stored on four tables, and a fetch time is not a snapshot's age: Cloudflare in front of TASO can answer a later request with a copy days old, which would then win. Nor would it change what the request that fetched the older snapshot shows: football-data's standings built from it stay in Redis for `STANDINGS_CACHE_TTL_SECONDS`, 15 minutes, whatever the table holds. |
| Not measured | How often it happens. Nothing logs two refreshes of one season overlapping, and a log line for it would be a mechanism of its own. |

## The citations this corrects

Records are added, not edited, so the earlier records keep their text. Where
they cite 196 for the outcome above, the decision is this record's:

| Record | Where | What 196 does and does not decide |
|---|---|---|
| `decisions/063-competition-zones.md` | "After the reviews", the finding "An older snapshot written after a newer one replaces its levels" ("decisions/196 accepts it") | 196 does not decide it. Accepted here |
| `decisions/628-zeroed-continuation-tables.md` | The row "Two syncs of a season at once" ("Not serialised, as before (decisions/196)"), whose worst case is "the older snapshot written last" | 196 leaves the syncs unserialised; it does not decide that the older snapshot may win. Accepted here |

Their other citations of 196 stand. 063's "two syncs at once both succeed" and
"levels of both" and 628's "rows of both" are what 196's upsert does on a cold
table. 665's "Two syncs of one season already wait on each other" is the warm
table's row locks, which are why 196's race is reachable only on a cold one.
