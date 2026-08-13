# End-to-end tests

Playwright tests that exercise the running application through a real
Chromium browser, against a real Postgres/Redis and the live
football-data.org API — the same setup used for local development
(`npm run dev`), not a mocked provider.

## Prerequisites

- `docker compose up -d` (Postgres + Redis running locally)
- A configured `.env` with a working `FOOTBALL_DATA_API_KEY` (see
  `README.md`'s Quick Start)
- Chromium installed for Playwright: `npx playwright install chromium`
  (one-time, not run automatically on `npm install`)

## Running

```bash
npm run test:e2e
```

`playwright.config.ts` starts `next dev` for you if nothing is already
listening on `http://localhost:3000`, and reuses an already-running dev
server otherwise — so `npm run dev` in another terminal works too.

## What's covered

One or two focused tests per shipped flow, asserting on structure and
behavior (headings, table presence, row counts, URL params, Finnish
fallback banners) rather than specific team names or scores — the real
season's data changes over time, so hardcoding exact content would make
these tests brittle:

- `home.spec.ts` — standings table loads for the default season; the
  `Kierros` selector narrows standings and updates the URL; invalid
  `kausi`/`kierros` show their Finnish fallback banners.
- `team.spec.ts` — clicking a team name navigates to `/joukkue/:id` and
  shows its match list; an unknown team id shows the not-found state.
- `matches.spec.ts` — `/ottelut` shows the current round and round
  navigation works; a team name links back to `/joukkue/:id`; an invalid
  `kierros` shows its fallback banner.

## Not covered here

- Running in CI — this suite is local-only for now. It's expected to move
  into a separate release workflow once one exists, not the regular PR CI
  pipeline (`.github/workflows/ci.yml`, which stays typecheck/lint/unit/
  integration only).
- Cross-browser coverage — Chromium only.
