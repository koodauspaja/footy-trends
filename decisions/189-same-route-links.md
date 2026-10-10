# 189 — Links that stay on the same route are not prefetched

## Decision

A link to the page it is on, with other search params, is a `SameRouteLink`
(`src/components/same-route-link.tsx`), which turns prefetching off. Four places
have one:

| Where | The link |
|---|---|
| `competition-matches-page.tsx` | the previous and next round |
| `prediction-quality-page.tsx` | the region and the prediction-type switches |
| `admin-user-table.tsx` | the pager |
| `team-matches-outcome.tsx` | the club's other seasons, when this one has no matches |

## Why

In a production build, `<Link>` prefetches every link that scrolls into view.
For a link to the same route with other search params, clicking then changes
the URL and leaves the page as it was: no request is made, no error is logged,
and a reload shows the right page. `next dev` does not prefetch, so it never
happens there.

- **#189** found it on the round links, when the end-to-end suite first ran
  against a production build. The fix was `prefetch={false}` on those two
  links, with a comment saying they were the only ones of their kind.
- **Release v1.14.0** found it again on the prediction switches (#519): the
  release gate's end-to-end run failed three times out of three, with the URL
  reading `tyyppi=ennakkoon` and the page still linking to `jalkikateen`. The
  next such link was written without anyone reading a comment in another file.

So the rule moved from a comment beside two links to a component with a name.
The other two places were found by reading every `href` in `src`; neither had
been seen failing, and both have the same shape.

## What this does not do

- **It does not explain the router's behaviour.** Why a prefetched entry for
  the same route is served stale was not isolated, in #189 or now. Every route
  here is reached through a rewrite, which is the first place to look.
- **Nothing stops the next plain `<Link>` to the same route.** The suite a pull
  request runs uses `next dev`, where this cannot fail; only the release gate
  runs a production build. A reader adding such a link has this record and the
  component's name to find.

## Tests

- `tests/unit/components/same-route-link.test.tsx`: prefetching is off and
  every other prop passes through.
- `tests/e2e/prediction-quality.spec.ts`, "the switches keep each other's
  choice", and `tests/e2e/matches.spec.ts`, the round step: both fail against a
  production build (`E2E_TARGET=build`) without the component.

## Moved from comments, 2026-10-07

Cut from `tests/e2e/matches.spec.ts` at `0fe724f` by #531.

- **Why the round step asserts that a link exists.** With neither link
  present the test clicked nothing and failed on the unchanged heading, and
  that ambiguity cost real time while this bug was being diagnosed.
