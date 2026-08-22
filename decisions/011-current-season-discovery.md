# 011 — Current season discovery: implementation decisions

Spec: `specs/011-current-season-discovery.md`
Issue: #124

Replaces spec 009's hardcoded `LATEST_TASO_SEASON = 2026`, which would have
made 2027 unreachable and unrefreshable with no visible failure.

## A `competition_id` is a season, not a competition

The spec was drafted believing the selection rule would need reworking once
Ykkösliiga or Suomen Cup are added. Checking `getCategories` before
implementing showed the opposite: `spljp26` is a container for *all* Finnish
football in 2026, holding **28 categories** — `VL` (Veikkausliiga), `M1L`
(Ykkösliiga), `MSC` (Miesten Suomen Cup), `NL` (Kansallinen Liiga) and the
rest. That is why every other TASO call in this codebase passes both
`competition_id` and `category_id`.

So `getCurrentSeason` is competition-agnostic by construction: a Finnish
competition added later reuses the same season lookup with a different
`category_id`, and this code does not change. It is named and documented as
a *season* lookup rather than a Veikkausliiga one to keep that clear.

Consequently `getCurrentSeason` takes no `category_id`, unlike
`getSeasonMatches` and `getSeasonGroups` — deliberate, not an oversight.

## The `\d{2}` in the id pattern is load-bearing

`/^spljp\d{2}$/` looks like it could be simplified to a `startsWith("spljp")`
test. It cannot. TASO publishes exactly two `spljp`-shaped competitions, and
they agree on every other field a filter might use:

```
spljphhl26   season_id=2026  status=published  'SPL Huuhkaja-Helmariliiga 2026'
spljp26      season_id=2026  status=published  'SPL Jalkapallo 2026'
```

Same prefix, same season, same status — and `categories` comes back empty on
this endpoint, so the `category_id` filter used elsewhere is unavailable
here. Only the exact id shape separates them.

A prefix test passes every other assertion in the suite, so
`tests/unit/lib/taso.test.ts` carries a case built specifically to fail it:
a fixture where `spljphhl27` is *newer* than `spljp26`, so a prefix match
would return 2027.

## The default season had a chicken-and-egg problem

The spec's rule — default to the newest season that *has matches*, so the
landing page never shows the empty state between publication and kickoff —
is not implementable as a pure database question. A season with no stored
rows is indistinguishable from one that simply has not been visited yet, and
since the default determines what gets visited, "newest season with stored
matches" would never advance to a new season on its own.

`resolveTasoSeasonContext` therefore *syncs* the discovered season to answer
it. That is the same work the page does for whatever season it renders, and
it is bounded twice: `cache()` deduplicates it within a request, and the
whole resolved context sits behind the existing 15-minute Redis TTL, so the
sync happens at most once per TTL rather than per render.

The check is `matches.length > 0`, not "has a played match" — an all-fixtures
season is a correct pre-season table thanks to spec 008's roster seeding,
and only a genuinely empty one is worth avoiding.

## Fallbacks are layered, and none of them error

Three degradations, in order: discovery failure → newest stored season →
the configured `EARLIEST_TASO_SEASON` floor. A TASO outage therefore shows
stale-but-correct data rather than an error page, matching how spec 009
already handles a failed match refresh.

The floor stays a constant rather than being discovered because
`getCompetitions` returns only *currently published* competitions — verified
live, no past season appears at all — so it can answer "what is the current
season" but never "what seasons have existed".

`getCurrentSeason` returns `null` rather than throwing or defaulting when it
recognizes nothing, leaving the fallback policy entirely to the service.
That keeps the client layer a pure mapping of TASO's response, consistent
with the rest of `taso.ts`.

## The ceiling is not guarded against going backwards

An earlier draft made the selector ceiling the higher of the discovered and
newest-stored season, so an unpublished season could not hide stored data.
Dropped during review: it only fires if TASO unpublishes a season we have
already synced — that is, unpublishes an *ongoing* season. Past seasons
leaving `getCompetitions` is normal and already covered by the floor.
Recorded in the spec's Edge Cases as a deliberate non-guard so it is not
re-added later as a perceived oversight.

## `resolveKotimaaPageContext` became async

It was synchronous precisely because the season range was static, which its
own comment called out. Making the range dynamic makes it async, which
propagates to all three `/kotimaa` pages and both their `generateMetadata`
functions — mechanical, but it is the bulk of the diff.

No `"error"` status was added to `KotimaaPageContext`, unlike
`resolveBasePageContext`: discovery failure is absorbed by the fallbacks
above, so there is nothing for a page to render differently and no banner to
show. The content is correct, just potentially not the newest.

## Verified against the live API, not only fixtures

The committed tests are fixture-based so they are deterministic in CI. But a
passing default-season test cannot distinguish "discovery worked" from
"discovery returned null and the fallback produced the same answer" — both
yield 2026 today.

That distinction was checked separately against the live API before opening
the PR: `getCurrentSeason()` returns `2026`, not `null`. Worth stating
because the same class of silent no-op bit spec 010 during implementation,
where a `=== null` check matched nothing and the feature did nothing at all.
