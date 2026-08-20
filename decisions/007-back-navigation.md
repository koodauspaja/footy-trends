# 007 — Back navigation: implementation decisions

Spec: `specs/007-back-navigation.md`
Issue: #103

## Two distinct problems, two distinct fixes

The spec deliberately separated "get back to the front page" from "get back to the previous content page," because they have different natural solutions:

- **"Always get home"** is a site-wide concern, not tied to any one page — and the app is expected to grow (a trends page per #89, cup competitions per #68), so a per-page link would need to be re-added to every future page. Solved once with a persistent `SiteHeader` rendered in the root layout, present on every route automatically, including ones that don't exist yet.
- **"Get back to standings"** is page-specific — `/ottelut` and `/joukkue/:id` each got their own "Sarjataulukkoon" link, since "the standings for what I was just looking at" is a different destination on each page (though both currently resolve to the same target shape, `/sarjataulukko?kilpailu=...&kausi=...`).

## `kierros` now survives both directions of the standings ↔ matches round trip

Confirmed live in chat: selecting a round on `/sarjataulukko`, then clicking "Kaikki ottelut," already dropped the round before this spec — a pre-existing gap, not something introduced here. Fixed both directions in the same change since they're the same bug from two sides: `/sarjataulukko`'s "Kaikki ottelut" link now appends `&kierros={round}` when a round is selected, and `/ottelut`'s new "Sarjataulukkoon" link appends the same when `getRoundMatches` resolved one (i.e. `result.status === "ok"`).

## Competition-switching UI explicitly deferred, not built

Discussed and confirmed in chat: a `Kilpailu` selector on `/ottelut`/`/joukkue/:id`, and "this team also plays in X" cross-competition links, are out of scope here. Today's 9 domestic-league competitions don't share teams with each other, so there's nothing meaningful to switch between yet — this only becomes real once cup/knockout competitions (#68) exist. Confirmed this isn't a design decision that needs revisiting later: every route is already parameterized by `kilpailu`, so a future cross-competition link is just another `<Link>` with a different `kilpailu` value, not a routing or data-model change.

## `/joukkue/:id`'s back link omits `kierros`

Unlike `/ottelut`, the team page's back link doesn't carry a round — team pages aren't scoped to a single round the way the matches list is (a team's `/joukkue/:id` view always shows its full season of matches), so there's no round value to carry back to standings.

## Extracted `resolveBasePageContext` in response to Sourcery review

Sourcery flagged that `resolvePageContext` in `/sarjataulukko` and `/ottelut` were near-identical (both pre-date this spec, from PR #114's `generateMetadata`/page-component dedupe). Extracted the shared competition/season resolution into `src/lib/page-context.ts` (`resolveBasePageContext`), which both pages now use directly. `/joukkue/:id`'s `resolvePageContext` builds on the same base, spreading in its team-specific fields (`teamProviderId`, `result`, `teamName`) on top. No behavior change — confirmed by the existing 252 unit tests passing unmodified at 100% coverage, since they mock `getSeasonContext`/`logger` at the same module boundaries the shared helper still calls through.

Sourcery's other suggestion — wrapping page content in `<main>` for a11y landmarks — needed no change: `PageShell`, used by every route, already renders a `<main>`.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 252 unit tests passing, 100% statement/branch/function/line coverage (new: `tests/unit/components/site-header.test.tsx`, plus extended coverage on the three page test files for the new/fixed links).
- 12 integration tests unaffected (this feature touches no data layer).
- 17 e2e tests passing, including three new cases: the header's "Etusivu" link from a non-home page, the round surviving `/sarjataulukko` → `/ottelut`, and the "Sarjataulukkoon" link surviving `/sarjataulukko` → `/joukkue/:id` → back.
- Manual verification against a real dev server: confirmed "Etusivu" renders on the picker, and both "Etusivu" and "Sarjataulukkoon" render on `/ottelut` and `/joukkue/:id`.
