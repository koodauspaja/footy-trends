# 011 — Current season discovery (TASO)

## Summary

Discover the current Finnish football season from TASO instead of
hardcoding it, so a new season becomes reachable and refreshable without a
code change.

Framed as *the season*, not *Veikkausliiga's season*, deliberately: TASO's
`competition_id` identifies a season of all Finnish football, with each
competition a `category_id` inside it. Veikkausliiga is the only category
the app uses today, but any added later shares this same lookup.

## Scope

### In scope

- Reading the current `competition_id` from TASO's `getCompetitions`
  endpoint, cached, and using it for three things spec 009 currently drives
  off a hardcoded constant: the season selector's ceiling, the default
  season, and the "current season" that `needsRefresh` treats as
  refreshable.
- A fallback that keeps every `/kotimaa` page usable when discovery fails.
- Superseding spec 009's fixed 2015–2026 range (see Files To Update).

### Out of scope

- The **floor**, which stays a configured `2015` constant, mirroring
  `FOOTBALL_DATA_EARLIEST_SEASON`. TASO's `getCompetitions` does not list
  past seasons at all, so it cannot supply one.
- football-data.org's season handling, which already resolves its season
  from the provider via `getSeasonContext` and is untouched.
- Backfilling seasons before 2015.
- Other Finnish competitions (Ykkösliiga, Suomen Cup) — still separate
  future work per spec 009. Note they will *share* the discovered season
  rather than need their own, since they are categories within the same
  `competition_id` (see API & Data).
- Adding a carry-over config entry for any newly discovered season. A new
  season's split groups still need validating before they are own-calculated,
  per spec 009's Open Questions and #127.

## UX / UI (Finnish strings)

**No new strings, and no new UI.** The change is which seasons the existing
controls offer and which one they land on:

- The `Kausi` selector on `/kotimaa/sarjataulukko`, `/kotimaa/ottelut`, and
  `/kotimaa/joukkue/:id` lists the discovered current season down to 2015,
  instead of a fixed 2026 ceiling. Labels stay bare years, per spec 009.
- With no `?kausi=` parameter, the pages open on the default season defined
  under API & Data.
- The existing fallback banner **`"Kautta ei löytynyt. Näytetään kausi
  {seasonLabel}."`** still shows for a `?kausi=` outside the range. The
  range's upper end now moves on its own, so a season that was invalid last
  year can become valid without a deploy.
- Discovery failure is invisible to the user: the page renders on the
  fallback season with no banner and no error, since the content is correct,
  just potentially not the newest.

## API & Data

**Endpoint**: `GET https://spl.torneopal.net/taso/rest/getCompetitions`,
using the same required headers as the existing TASO calls
(`Accept: json/{key}`, `Referer`, `Origin`, `User-Agent`).

**Verified live** (2026-08-22): returns 393 competitions and only
*currently published* ones — no past Veikkausliiga season appears at all
(`spljp25`, `spljp15`, … are all absent). It therefore answers "what is the
current season" and cannot answer "what seasons have ever existed", which
is why the floor stays configured.

Relevant fields per entry: `competition_id`, `season_id`,
`competition_status`, `competition_name`. Note `categories` comes back
**empty** (`[]`) here, so the `category_id=VL` filter used on `getMatches`
and `getGroups` is *not* available on this endpoint.

### Selection rule

Match `competition_id` against `/^spljp\d{2}$/` **exactly**, keep entries
with `competition_status: "published"`, and take the highest `season_id`.

**This discovers the season, not the competition.** `spljp26` is the
container for *all* Finnish football in 2026 — `getCategories` returns 28
categories inside it, including `VL` (Veikkausliiga), `M1L` (Ykkösliiga),
`MSC` (Miesten Suomen Cup) and `NL` (Kansallinen Liiga). That is why every
existing call passes `competition_id=spljp26&category_id=VL`. So when other
Finnish competitions are added they reuse this same `competition_id` with a
different `category_id`, and this rule needs no revisiting — it is
competition-agnostic by construction, not a Veikkausliiga special case.

A prefix test on `spljp` is still wrong. Exactly two entries are
`spljp`-shaped, and they agree on every other field a naive filter would
use:

```
spljphhl26   season_id=2026  status=published  'SPL Huuhkaja-Helmariliiga 2026'
spljp26      season_id=2026  status=published  'SPL Jalkapallo 2026'
```

Same prefix, same season, same status. Neither the prefix nor the season
number disambiguates; only the exact id pattern does. `spljphhl26` is a
separate competition (Huuhkaja-Helmariliiga), not one of `spljp26`'s
categories, so excluding it stays correct as more categories are added.

### Default season

The default landing season is **the newest season that has at least one
stored match**, not simply the newest discovered one.

TASO publishes a `competition_id` some time before that season kicks off.
Defaulting to the newest published season would open
`/kotimaa/sarjataulukko` on a season with no matches, which
`getSeasonStandings` reports as `status: "empty"` and the page renders as
`"Sarjataulukkoa ei ole saatavilla."` — an empty-looking landing page for
however long that gap lasts each year.

A season with only *unplayed* fixtures is fine and does become the default:
spec 008's roster seeding renders every team at zero stats, which is a
correct pre-season table, not an empty state.

Newer published seasons still appear in the selector and are reachable via
`?kausi=`; only the default lags.

### Cache freshness

`needsRefresh`'s notion of "the current season" becomes the discovered
season rather than a constant. A season below it is still never refetched
once stored; the current one still refreshes on the existing 15-minute
threshold.

### Caching

The discovery lookup is cached through the existing `getCached` helper on
the current-season TTL (`15 * 60` seconds), matching how
`getCachedSeasonGroups` already caches. At most one extra TASO request per
15 minutes, not one per render.

## Edge Cases

- **Discovery fails** — outage, expired/invalid key, non-2xx, or a malformed
  response. Fall back to the newest season that already has stored matches,
  so the site degrades to stale-but-correct rather than erroring. Logged at
  `warn` with enough detail to distinguish "key needs re-scraping" from
  "TASO is down", matching spec 009's 403 handling.
- **Discovery succeeds but nothing matches the rule** — an empty list, or
  only non-Veikkausliiga competitions. Treated exactly like a failure above:
  fall back, do not error.
- **Nothing is stored either** (a fresh database plus a failed discovery) —
  fall back to the configured floor, `2015`, which is guaranteed to be a
  real season. The page then renders whatever that season yields, including
  its own empty state if the database is genuinely empty.
- **The discovered season is older than a stored one.** The ceiling is
  *not* raised to cover the stored season: that requires TASO to unpublish
  a season we have already synced, i.e. an ongoing one, and past seasons
  dropping out of `getCompetitions` is normal and already handled by the
  floor. The ceiling is simply the discovered season.

  The **default** is clamped to that ceiling, though. Without it the
  fallback could return a stored season above the ceiling, landing the page
  on a season its own selector does not offer and which `needsRefresh`
  would treat as newer than active. That is a one-line consistency clamp,
  not the ceiling-raising guard above.
- **A newly discovered season has no carry-over config entry**, so its split
  groups render pass-through with no round selector until validated. This is
  spec 009's existing, deliberate behaviour and is not changed here — it
  degrades correctly rather than silently miscalculating.
- **`spljphhl26` and future sibling competitions** — excluded by the exact
  id pattern. Asserted explicitly in tests, since this is the failure mode
  most likely to be reintroduced by a well-meaning simplification.

## Performance & Limits

One extra TASO request per 15 minutes per competition, shared across all
`/kotimaa` pages via the existing Redis cache. Negligible against the ~1 MB
`getMatches` season response already fetched on the same TTL.

No additional database queries: the "newest season with stored matches"
fallback and default both read data the pages already load, or a single
indexed lookup against `taso_matches`.

TASO publishes no documented rate limit; the existing caching keeps request
volume in the same order as today.

## Security & Secrets

No new secrets and no new env vars — `getCompetitions` uses the existing
`TASO_API_KEY`, read server-only and never sent to the client, with the same
fixed `Referer`/`Origin`/`User-Agent` constants the other TASO calls need.
`.env.example` is unchanged.

## Acceptance Criteria

- [ ] A new season is reached with no code change when TASO publishes its
      `competition_id` — verified against a fixture whose newest entry is
      `spljp27`.
- [ ] `spljphhl26` is never selected, despite sharing the `spljp` prefix,
      the `published` status, and the `season_id`.
- [ ] A published season with no matches does not become the default; the
      newest season with matches does. It still appears in the selector and
      is reachable via `?kausi=`.
- [ ] A season whose matches are all unplayed fixtures *does* become the
      default, rendering zero-stats rows rather than an empty state.
- [ ] A failed or empty `getCompetitions` renders a usable page on the
      newest season with stored matches, with no error and no banner.
- [ ] With no stored matches and a failed discovery, the page falls back to
      2015 rather than crashing.
- [ ] Past seasons are still never refetched; the current season still
      refreshes on the 15-minute threshold.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit` (100%
      coverage maintained), `npm run test:integration`, and
      `npm run test:e2e` all pass.

## Tests Required

All fixture-based, so they are deterministic in CI without live API access.

- `tests/unit/lib/taso.test.ts`
  - `getCompetitions` response parsing and header construction (without
    asserting the literal key value), mirroring the existing TASO tests.
- `tests/unit/lib/taso-standings-service.test.ts`
  - a fixture whose newest matching entry is `spljp27` resolves to 2027;
  - `spljphhl26` is rejected even when it is the only other entry and
    carries the same `season_id` and `published` status;
  - a non-`published` entry is ignored;
  - discovery failure falls back to the newest season with stored matches;
  - discovery failure with nothing stored falls back to 2015;
  - a discovered season with no matches is not the default, but a season
    with only unplayed fixtures is;
  - `needsRefresh` treats the discovered season as current and anything
    below it as never-refetch.
- `tests/unit/lib/kotimaa-page-context.test.ts`
  - the selector lists 2015 up to the discovered season, newest first;
  - `?kausi=` validation follows the moving ceiling.
- `tests/unit/app/kotimaa/**/page.test.tsx`
  - all three pages default to the resolved season and render normally when
    discovery fails.
- `tests/e2e/kotimaa-standings.spec.ts`
  - the default season still loads a populated table against live data,
    guarding the whole path end to end.

## Files To Update

- `specs/011-current-season-discovery.md` (this file)
- `specs/009-veikkausliiga.md` — short supersession pointers only, where its
  fixed 2015–2026 range is now wrong. The design lives here, not there.
- `decisions/009-veikkausliiga.md` — its "Known limitation: the season range
  is hardcoded" section is superseded; short note only.
- `decisions/011-current-season-discovery.md` — written by the implementing
  agent, not the spec author.
- `src/lib/taso.ts` — a `getCompetitions` call and its response type.
- `src/lib/taso-standings-service.ts` — the cached discovery lookup, its
  fallback, and `needsRefresh`'s current season.
- `src/lib/kotimaa-page-context.ts` — selector ceiling and default season,
  replacing `LATEST_TASO_SEASON`.
- `src/app/kotimaa/standings/page.tsx`, `src/app/kotimaa/matches/page.tsx`,
  `src/app/kotimaa/team/[id]/page.tsx` — they pass `LATEST_TASO_SEASON`
  today.
- Test files listed under Tests Required.
- No change to `.env.example`, `docs/setup/`, or the database schema.

## Open Questions

None outstanding.

Two were raised while drafting and settled before this spec was written:
the fallback on discovery failure (newest season with stored matches, then
the 2015 floor), and whether a published-but-unstarted season should become
the default (no — it must have matches, played or not). Both are recorded
under API & Data and Edge Cases rather than left implicit.
