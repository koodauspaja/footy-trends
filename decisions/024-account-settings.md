# 024 — Account settings

Implementation decisions for `specs/024-account-settings.md`. Issue #117 was a
placeholder warning against a speculative settings page: "needs to be grounded
in what the app actually lets a user customize… not a speculative
theme/language/notifications list". Every setting below maps to something that
already existed as a hardcoded value.

## What the app actually let anyone customise

Measured before proposing anything:

| Finding | Consequence |
|---|---|
| `REGION_DEFAULTS` hardcodes `PL` for Ulkomaat and `WC` for Maajoukkueet; `DEFAULT_DOMESTIC_COMPETITION_CODE` hardcodes `VL` | A real knob, already there, with no way to change it |
| `/` is a three-way region picker on every visit | A real repeated click |
| 21 files carry hardcoded light colour classes and `src/` has **zero** `dark:` variants | A theme setting would expose a broken theme — see #269 |
| `image` is stored by 023 and rendered nowhere | The avatar cost no new data |

Language is not a setting (CLAUDE.md mandates Finnish) and there is no
notification infrastructure. A default *season* was rejected too: the current
season is discovered (`specs/011`), so a pinned one goes stale silently.

## Two constraints shaped everything

**Nothing a setting does may make a page unreachable.** Miikka's rule, and it
caught a real error in the first draft of the spec, which said a reader with a
default region is "still redirected" from `/`. That would have left the region
picker reachable only by typing a URL — and worse, the `Etusivu` crumb would
have bounced a reader straight back to the region they were already in, looking
broken. So `/?valitse=1` never redirects, and the crumb points there whenever a
default is set. The escape hatch is what makes the redirect safe to have at all.

**`/` must stay prerendered.** The region default is applied **client-side**;
the competition defaults are applied **server-side**. That asymmetry is not
inconsistency, it is the #182 constraint: `/`, `/kotimaa`, `/ulkomaat` and
`/maajoukkueet` are `STATIC_BY_DESIGN` and reading a session on the server there
would cost them their prerender. The competition pages are already
`force-dynamic` and lose nothing. Verified in the build output, unchanged:

    ┌ ○ /                    ← still static
    ├ ○ /domestic            ← still static
    ├ ○ /foreign             ← still static
    ├ ○ /national-teams      ← still static
    └ ƒ /settings            ← dynamic, as it must be

`tests/unit/app/rendering-mode.test.ts` passes with no edit.

## The module split the bundler forced

The first build failed with `Can't resolve 'dns' / 'net' / 'tls'`. The import
trace named it exactly:

    settings-page.tsx [Client]
      → domestic-competitions.ts → taso.ts → cache.ts → redis.ts → ioredis

A client component importing a competition registry drags ioredis into the
browser bundle. `@/db` does the same with the Postgres driver. So preference
code is now in three files, and the split is load-bearing rather than tidiness:

| Module | Contains | Importable from |
|---|---|---|
| `regions.ts` | region segments, validation, `Preferences` | anywhere, including client components |
| `competition-preferences.ts` | anything needing a competition registry | server only |
| `preferences.ts` | the database reads | server only |

The settings form takes its option lists as props from the server page rather
than reaching for a registry.

## Where the preference is read from

Three different places, for three different reasons:

- **`resolveBasePageContext` / the domestic equivalent** call
  `getViewerPreferences()` internally, so **no page file changed**. Precedence is
  URL → team context → preference → hardcoded default. An explicit `?kilpailu=`
  always wins: a shared link must render what it says (`specs/012`), and a
  stored default is a weaker statement than a typed URL.
- **The browser** gets `defaultRegion` on the session it already fetches, via
  better-auth's `customSession` plugin. A second client fetch would have been a
  round trip for one string.
- **`/asetukset`** reads its session on the server. The spec originally said
  client-side "consistent with 023"; that was wrong and the spec was corrected
  while implementing. 023 reads client-side because those pages are
  *prerendered*. This one is per-user, can never be prerendered, and everything
  it shows is server data.

**Signed-out readers pay nothing.** `getViewerPreferences` returns before
touching better-auth or Postgres when no session cookie is present, and they are
the overwhelming majority of traffic.

## Deciding what not to guard

Two guards were removed rather than tested:

- `FOOTBALL_DATA_REGION` was a `Partial<Record<…>>` needing an `undefined`
  check. It is now a total function taking `Exclude<RegionSegment, "kotimaa">`;
  every caller already returns early for Kotimaa, so TypeScript narrows and the
  unreachable branch is gone. A guard for an impossible state is a second source
  of truth and an untestable branch.
- Sign-out failure could not reach `report("signout")` from a failed URL
  rewrite, because `then(onFulfilled, onRejected)` plus a terminal `catch`
  separates the two. Carried over from #266.

## Two tests that proved nothing, caught before merging

**The e2e "no IP address" and "preferences render" tests were asserting against
the signed-out page.** `/asetukset` reads its session on the server, so
intercepting the browser's `/api/auth/get-session` — the technique that works
for the header — does not reach it. Those tests looked like they covered the
signed-in page and did not. They were deleted, and the gap is stated in the spec
and in the spec file's own comment: the form, device list and deletion control
are covered by `tests/unit/components/settings-page.test.tsx`, and the real
thing is a human check on staging.

**The escape-hatch e2e test passed with the escape hatch removed.**
`toHaveURL` matches on its first check, before the session resolves and the
redirect fires, so "no redirect happened" was true simply because nothing had
happened yet. It now waits for the session to resolve first, and against the
mutated component it fails with
`Received: "http://localhost:3000/kotimaa"`.

Both are the same class as the header-overflow test in #265. Reverting the
implementation and watching the test fail is the only thing that distinguishes a
regression test from a decoration.

## Verification

- `npm run test:unit` — **100% statements, branches, functions and lines**
- `npm run test:integration` — 62 against real Postgres, 7 new
- `npm run test:e2e` — **173 passed** against a production build
- `npm run lint`, `npm run typecheck`, `npm run build` — clean
- Migration `0011` applied to a real Postgres and inspected with `\d`: unique
  `user_id`, cascading foreign key, all four preference columns nullable
- The four `STATIC_BY_DESIGN` pages still prerender

## Deliberately not built

Favourite teams (#118), team search (#247), choosing an avatar (#268), a theme
toggle (#269 tracks the half-built dark mode), roles, admin tooling, ending one
specific session, and data export.

**Not verifiable without a human:** the settings page signed in, the device list
against real sessions, and account deletion end to end. A real Google sign-in
cannot be automated, which is the gap 023 documented and this feature inherits.
