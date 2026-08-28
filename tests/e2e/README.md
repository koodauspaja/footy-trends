# End-to-end tests

Playwright tests that exercise the running application through a real
Chromium browser, against a real Postgres/Redis and the live
football-data.org API — the same setup used for local development
(`npm run dev`), not a mocked provider.

## Prerequisites

- `docker compose up -d` (Postgres + Redis running locally)
- A configured `.env` with a working `FOOTBALL_DATA_API_KEY` **and**
  `TASO_API_KEY` (see `README.md`'s Quick Start and
  `docs/setup/020-taso-api-key.md`). `global-setup.ts` fails fast on either
  being missing, rather than letting every spec time out against a generic
  error page
- Chromium installed for Playwright: `npx playwright install chromium`
  (one-time, not run automatically on `npm install`)

## Running

```bash
npm run test:e2e
```

`playwright.config.ts` starts `next dev` for you if nothing is already
listening on `http://localhost:3000`, and reuses an already-running dev
server otherwise — so `npm run dev` in another terminal works too.

To run them the way the release gate does, against a production build:

```bash
npm run build
E2E_TARGET=build npm run test:e2e
```

Worth doing before cutting a release, and worth reaching for when a spec
passes locally but fails in CI: `dev` and a production build do not always
behave the same, which is how #189 was found.

## What's covered

One or two focused tests per shipped flow, asserting on structure and
behavior (headings, table presence, row counts, URL params, Finnish
fallback banners) rather than specific team names or scores — the real
season's data changes over time, so hardcoding exact content would make
these tests brittle:

- `picker.spec.ts` — the competition picker at `/` lists competitions and
  navigates to the chosen one's standings page.
- `standings.spec.ts` — `/sarjataulukko` loads the standings table for the
  default season and for a different competition (`kilpailu`); the
  `Kierros` selector narrows standings and updates the URL; invalid
  `kausi`/`kierros` show their Finnish fallback banners.
- `team.spec.ts` — clicking a team name navigates to `/joukkue/:id` and
  shows its match list; an unknown team id shows the not-found state.
- `matches.spec.ts` — `/ottelut` shows the current round and round
  navigation works for both the default and a different competition; a
  team name links back to `/joukkue/:id`; an invalid `kierros` shows its
  fallback banner.

## Not covered here

- Running on every pull request. This suite runs in
  `.github/workflows/release.yml` only — on pull requests targeting `release`
  and on pushes to it. `.github/workflows/ci.yml` stays typecheck/lint/unit/
  integration and is scoped to `main`.
- Cross-browser coverage — Chromium only.
