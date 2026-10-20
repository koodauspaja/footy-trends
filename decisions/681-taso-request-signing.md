# 681 — TASO requests are signed from a configured salt, until official access: decisions

Chore #681. Since 2026-10-15 TASO refuses requests its own frontend has not
signed: ours get an empty 403 from every address, production included, so the
domestic pages serve only stored rows and the hourly predictions run fails its
TASO refreshes. The key was unchanged. What a browser's request from
tulospalvelu.palloliitto.fi had and ours did not were two query parameters:
`hash`, a SHA-256, and `url`, the string it is a digest of. This is a temporary
seam, decided by Miikka on 2026-10-20 ("introducing that temp seam to get the
taso working"), while the official arrangement in #307 is pending.

| Decision | Why |
|---|---|
| `request()` in `src/lib/taso.ts` appends `hash`: the hex SHA-256 of the route without its leading slash, `?`, the salt, then `&` and the query as the path carries it | The shape the browser's `url` parameter showed (`getCategory?<salt>&competition_id=…`), and the one the frontend's request interceptor builds: the route, the salt, then each parameter in order. A route with no query signs `<route>?<salt>` and gets `?hash=…`. |
| The salt is read from `TASO_HASH_SALT`, per request; blank or absent sends the request unsigned, exactly as before | The value is set by the maintainers outside the repository and never written into it. Unset keeps every environment that has no salt, the unit and integration suites included, on today's behaviour. Read per request, so a test sets it with `vi.stubEnv`. |
| `hash` only, not `url`; measured to suffice (below) | `url` carries the salt in plain text, and the request's path is logged on every call (`fetchProviderJson`) and can reach Sentry's spans, whose query filter does not cover that name. A digest reveals nothing of the salt. If TASO turns out to require `url`, it needs the path logged without it, a change to the shared request helper agreed first. |
| `TASO_HASH_SALT` declared in `.railway/railway.ts`, the PR-environment plan's optional secrets and `railway-environment.yml` | An apply removes any variable the file does not declare, so a salt set by hand in Railway would not survive the next one. Declared beside `TASO_API_KEY`, which it travels with. |
| Removed when official access arrives | The seam reproduces a check TASO added to its own frontend. Whether to rely on it, and for how long, is a decision with Palloliitto in view (#307). |

## Measured

| Check | Result |
|---|---|
| Unit: the digest of a fixed request and a test-only salt, a route with and without a query, a salt with surrounding space, and a blank salt | pinned values, see `tests/unit/lib/taso.test.ts` |
| Live, 2026-10-20: `getCompetitions` and `getCategories` through the client, the salt set | 200 each, `cf-cache-status` `MISS` and `EXPIRED`, so fetched from TASO and not a stale copy; current season 2026, 28 categories |
| The same, the salt blank (the control) | 403, as since 2026-10-15 |
| Live: `/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026` on a local server with the salt | the page 200 with no failure line; its five TASO requests (`getCompetitions`, `getMatches`, `getCategories` twice, `getCategory`) each signed and answered 200 |
| The salt in that server's log, the repository and the branch's commits | 0 occurrences each |
