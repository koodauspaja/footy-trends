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

## The auth import that broke fifty unrelated tests

CI failed where local runs passed, and the reason was worth recording rather
than patching around. `page-context.ts` calls `getViewerPreferences()`, so
`viewer.ts` — and therefore `auth.ts` — became a transitive import of every
competition page. `auth.ts` constructs better-auth at module load and throws
without its four environment variables, and the CI `unit` job deliberately has
**no environment at all** (#158). Dozens of page tests that have nothing to do
with authentication failed with
`BETTER_AUTH_SECRET is required for authentication but is not set`.

The fix is a deferred `await import("@/lib/auth")` inside `getViewerPreferences`,
placed *after* the session-cookie check. Mocking `@/lib/viewer` in fifty test
files would have been the other option; it would have hidden the actual problem,
which is that a page's context resolver should not construct an auth instance
merely by being imported. As a bonus, a signed-out request now never constructs
one either.

Reproduced locally by moving `.env` aside and running with the variables unset,
which is what CI actually does — that is the only way to see this failure
without pushing.

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

## The wiring that had no test, and the bug it hid

Review flagged the PR as incomplete against the issue, correctly. The audit
found the core feature untested: `preferredCompetitionFor` was unit-tested in
isolation and wired into both page-context resolvers, but **nothing asserted
that a stored preference changes what a page renders**. A wrong region mapping —
reading the foreign column on `/maajoukkueet`, say — would have passed every
test.

`page-context.ts` had no test file at all. It has nine now, including one that
exists purely to pin the mapping: a foreign and a national preference set at the
same time must resolve to different competitions.

Writing them found a real spec/code contradiction. This spec said an invalid
`?kilpailu=` must fall back to the **hardcoded** default, "because the notice
would then name a competition the reader never asked for". The code fell through
to the preference instead. Checking `ContextNotices` settled it: it renders
`resolved.competitionName`, so the banner names whatever is actually shown — and
a stored preference is something the reader chose explicitly. **The spec was
wrong on both counts and was corrected**; the code was right.

The first version of that test asserted only that the parameter was `invalid`,
which is trivially true and would have passed either way. Asserting the resolved
competition is what surfaced the contradiction.

## Reading the whole review, not the last comment

A first review left four inline comments and a second left two. Only the
second review's body was read, so four findings sat unaddressed while the PR
looked handled. Re-reading every inline comment on the PR found three real
`bug_risk` items still open, all in the same family — **failure states that lie
about what is true**:

| Finding | What it did | What it does now |
|---|---|---|
| `settings/page.tsx:38` | A failed preferences query rejected the render | The form is withheld and the page says loading failed. Rendering defaults would show settings apparently reset, and a save would overwrite the real ones — "failed" and "never saved" must not be the same state |
| `settings/page.tsx:56` | A failed `listSessions` became an empty list, so the page said `Olet kirjautunut sisään vain tällä laitteella.` | `Laitelistaa ei voitu ladata.`, with the sign-out button kept. The old text is a claim about the reader's account security that a failed request cannot support, and it hides the very sessions the section exists to reveal |
| `settings-actions.ts:35` | `currentUserId()` ran before the `try`, so an auth failure rejected the action | Inside the `try`. The client awaits with no rejection handler, so the reader got a form that silently did nothing instead of the promised notice |

The fourth finding — an invalid `?kilpailu=` falling through to the preference —
is the spec error described above; the code was right.

Each fix was checked by reverting it and watching the test fail: four tests go
red against the pre-fix code.

## Every failure state, eventually

A third review found two more of the same family, and the pattern is worth
naming: **each guard I added made the next unguarded call the weakest link.**
Preferences and the device list were handled, which left the session lookup
above them as the one unhandled call on the page; fixing the stale-session bug
with `refetch()` introduced a new promise that could reject.

- The settings page's own `getSession` now has its own state. A failure is
  deliberately **not** the sign-in prompt: that would claim the reader is signed
  out, which a failed lookup does not establish.
- A rejected `refetch()` reports `Asetukset tallennettu. Päivitä sivu, jotta
  muutokset tulevat voimaan.` The save genuinely succeeded, so calling it a
  failure would be a lie in the other direction — but the start region will not
  apply until the session is re-read.

## The seam nothing tested

Auditing the issue's criteria rather than trusting the earlier "needs a human"
label found one more gap, and it was the most important kind: **the write path
and the read path were each tested in isolation and never against each other.**
The action was tested with a mocked database, the resolvers with mocked
preferences. A competition column crossed with the wrong region — the exact bug
`page-context.test.ts` exists to catch on the read side — would have round-tripped
cleanly through the action's own tests.

`tests/integration/settings-actions.test.ts` closes it against real Postgres:
what `saveSettings` writes is what `getPreferencesFor`, `getDefaultRegionFor`
and `preferredCompetitionFor` later read, per region, including unsetting and
the "stored but no longer in the registry" case. Only the session is mocked,
because a real one needs a Google sign-in.

That also re-graded five criteria that had been left unticked as
"un-automatable". They were not: the signed-in header is covered end to end via
session interception, the device list and its no-IP rule at the route level, the
deletion gate and its four-table cascade across unit and integration. What was
genuinely missing was the seam above, not a browser.

## The one review finding that turned into a product decision

The last round flagged `Chrome · macOS` as English strings in a Finnish UI. My
first response was to argue in a commit message that these are product names —
which is not a decision, is invisible on the PR, and left the finding untouched.

The repo's own convention is more precise than "brands are not translated": it
translates where a Finnish form exists (`Valioliiga`, `Itävalta`) and keeps the
proper noun where none does (`Bundesliga`, `Serie A`, `Ligue 1`). No Finnish
form exists for Chrome or macOS, so by that convention both could stay.

Put to Miikka rather than settled unilaterally, the answer was better than
either option I was weighing: **drop the operating system entirely.** It was
saying what the browser already says, at the cost of a second English token per
row. The `SYSTEMS` table is gone rather than left unused, and a test now asserts
that no output names an OS. The accepted cost — two Chrome sessions on different
machines reading alike — is recorded in the spec.

## Verification

- `npm run test:unit` — **100% statements, branches, functions and lines**, and
  verified per file rather than only in aggregate: vitest omits files no test
  imports, which is how `settings-actions.ts` and `app/settings/page.tsx` read
  as 100% locally while Sonar reported them at 0%. Both have tests now.
- Run with `.env` moved aside and the variables unset, which is what the CI unit
  job actually is
- `npm run test:integration` — 63 against real Postgres, 8 new, including one
  proving a single account deletion removes the `user`, `session`, `account`
  **and** `user_preferences` rows together
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
