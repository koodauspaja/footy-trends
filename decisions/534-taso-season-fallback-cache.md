# 534 — A TASO season fallback built from a failure is not cached: decisions

Bug #534, 2026-10-09. When TASO could not be asked for the current season,
`resolveTasoSeasonCeiling` built a ceiling from what was stored and cached it
for 15 minutes. `resolveTasoSeasonContext` did the same with the context it
built after a failed sync. TASO recovering a minute later changed nothing: the
season selector and the default season stayed on the older season until the
entry expired.

## The rule

A value built because TASO failed is returned and not stored. The next request
asks TASO again.

That is the rule football-data's side already had: `getStandings` in
`src/lib/standings-service.ts` writes its cache only when the refresh did not
fail. The two providers now agree.

The issue allowed either no caching or a short one. No caching, because a short
TTL is a second number to choose and to explain, and it still serves a fallback
to every request inside it.

## What counts as a failure

| What happened | Ceiling | Context |
|---|---|---|
| TASO answered with a season | cached | depends on the sync |
| TASO answered, and named no season this code recognizes | cached | depends on the sync |
| The season lookup threw | not cached | not cached |
| The current season's sync failed, rows stored or not | — | not cached |
| The check for matches threw | — | not cached |

The second row is an answer and not an outage: asking again gets the same one,
so it is cached as before. `discoverCurrentSeason` returned `null` for both that
and a thrown lookup, which is why the ceiling could not tell them apart; it now
returns `failed` beside the season.

A context built on a ceiling that was not cached is not cached either, whatever
its own sync did. The ceiling carries `discoveryFailed` for that.

A failed sync with rows stored yields the same context a successful one would,
`defaultSeason` equal to the current season. It is still not cached: one rule
for every failure, and the cost is one more resolve per request during an
outage, which the page's own read of the season already pays.

## The mechanism

`getCachedUnlessDegraded` in `src/lib/cache.ts`. Its fetcher answers
`{ value, degraded }`, and a degraded value is returned without a write.
`getCached` is now that function with `degraded: false`, so there is one read
and one write path, not two.

The flag travels beside the value and not inside it, so `TasoSeasonContext`,
which every `/kotimaa` page reads, did not gain a field only the cache needs.

## What this overrides

`decisions/011-current-season-discovery.md` says the whole resolved context
sits behind the 15-minute TTL, "so the sync happens at most once per TTL rather
than per render". That holds while TASO answers. During an outage the lookup
and the sync are tried once per request, each attempt bounded by the timeout in
`decisions/363-render-timeouts.md` and deduplicated within the request by
`cache()`.

`specs/011-current-season-discovery.md` put the cost at one extra TASO request
per 15 minutes. Its Caching and Performance sections now state the exception.

## The keys are versioned

`taso:season-ceiling:v2:<code>` and `taso:season-context:v2:<code>`. An entry
under the old keys may be a fallback, written before this change or by an old
instance while a deployment rolls, and nothing in it says so. The new code
reads only keys that the old code never wrote. Sourcery raised it on the first
review.

## Not changed

Other `getCached` callers were read for the same fault and none has it: their
fetchers throw on a failure, and a thrown fetcher was never cached.
