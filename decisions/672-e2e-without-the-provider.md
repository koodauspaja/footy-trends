# 672 — The end-to-end suite does not reach TASO: decisions

Chore #672. On 2026-10-15 TASO began refusing requests that were not signed the
way its own frontend signs them, and the suite's server, which sent them
unsigned, was answered with an empty 403. Two specs failed on a developer's
machine, `mens-team` and `womens-team`, both on the national-team year lists.
The cause is in `getNationalTeamYears`: a category with no stored rows is
fetched, a failed fetch makes the whole season `null`, and the year is left out.
Which categories had rows was whatever earlier runs had stored, so the suite
passed or failed on a machine's history, not on the code.

| Decision | Why |
|---|---|
| `TASO_API_BASE_URL` names the server TASO requests go to, read per request in `src/lib/taso.ts`; unset, the provider's own address | The server's fetches cannot be intercepted from Playwright, and a variable is the smallest seam. Read when the request is made, so a unit test sets it without reloading the module. Production and staging set nothing and do not change. |
| The stand-in is opt-in: `E2E_TASO_STUB=1` makes Playwright start it (`tests/support/taso-stub-server.ts`) as a second `webServer`, on port 3002 or `E2E_TASO_PORT`, and set `TASO_API_BASE_URL` for the app's server | Decided by Miikka, 2026-10-19: an emergency override for while TASO refuses our requests, not a change to what the suite is. Unset, the suite reaches TASO as before, and `release.yml` sets nothing. When TASO answers again, through a registered key or by signing requests in `request()`, the line comes out of `.env` and no code changes; the stand-in ignores any parameter it is not asked about, a `hash` included. |
| The stand-in answers `getCategories` and `getMatches` for the national-team buckets (`maajp2022` to `maajp2026`, `maajp18`) and refuses everything else with a 503 | Refusing is what the provider does today, and what the app already handles: a page falls back to what is stored. An empty answer for an unknown season would have replaced a stored season with nothing, since a refresh that succeeds is trusted over the rows. A known bucket's category with no matches is answered with an empty list, which is the true answer and the one that lets the bucket load. |
| The answers are recorded in `tests/e2e/fixtures/taso-national-teams.json`, from the 227 national-team rows and the category names a development database held on 2026-10-19, turned back into TASO's response shape | The pages then show what the provider's answers made them show, opponents named in English included, which `mens-team` and `womens-team` assert on. `maajp2026`'s category names had expired from the cache, so it takes `maajp2025`'s. |
| `TASO_API_KEY` stays required, by `global-setup.ts` and the pre-push freshness check alike, and the server gets the developer's own | Decided by Miikka, 2026-10-19: the override changes where requests go, nothing else, so turning it off needs nothing restored. With the stand-in on, the key reaches only `localhost`. |

## Measured

On 2026-10-19, with TASO refusing:

| State | Specs | Result |
|---|---|---|
| Before, the developer's database and Redis as earlier runs left them | 397 | 395 passed, 2 failed |
| After, the same, `E2E_TASO_STUB=1` | 397 | 397 passed |
| After, `mens-team`, `womens-team` and `national-team-analytics` on an empty test database and an empty Redis index | 28 | 28 passed |

The suite's Redis is the one `npm run dev` uses, so the stand-in's answers are
cached there as the provider's would be: for 15 minutes for a season's matches
and `maajp2026`'s category names, a year for an older bucket's. Turning the
switch off therefore takes effect for a page only once its entries expire, which
also means a run with it off straight after one with it on proves nothing about
the switch. The development server reads the same entries; for the older
buckets they match what the provider sent, and `maajp2026`'s borrowed names last
15 minutes.

## What this does not do

The Veikkausliiga, Liigacup, Ykkösliiga and other competitions are not stood in
for. On an empty database their specs still need TASO, or the rows an earlier
run stored, so a clean checkout is not yet independent of the provider. A first
measurement, 142 of 397 failing, was taken on a database whose name did not end
in `_test`, which the e2e sign-in flag requires, so it overstates what TASO
alone costs; the remaining count is measured in the pull request that follows.
