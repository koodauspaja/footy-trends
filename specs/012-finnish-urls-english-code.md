# 012 — Finnish URLs, English code

## Summary

Make every URL Finnish and every identifier English: move the
football-data.org pages under `/ulkomaat/`, redirect the English paths that
are reachable today, and rename the `kotimaa`/`ulkomaat` folders, files and
identifiers to `domestic`/`foreign`.

## Scope

### In scope

- The three football-data.org pages move to `/ulkomaat/sarjataulukko`,
  `/ulkomaat/ottelut` and `/ulkomaat/joukkue/:id`, mirroring `/kotimaa/`.
- The old top-level URLs redirect permanently (308), preserving query
  strings.
- **Every English path stops being reachable.** `/standings`,
  `/kotimaa/standings` and the rest redirect to their Finnish equivalents.
- **Every Finnish identifier becomes English.** The `kotimaa` and `ulkomaat`
  folders, the two `kotimaa-*.ts` modules, their tests, and the ~15
  `Kotimaa*`/`KOTIMAA_*` identifiers become `domestic`/`foreign`.
- Every internal link, form action and back-link points at the new Finnish
  paths — nothing in the app relies on a redirect.

### Out of scope

- Any behaviour change to the pages themselves. Same data, same controls,
  same Finnish copy — this is routing and naming only.
- The root `/` region picker's own URL, which is already `/`.
- Removing the old URLs later. Redirects are kept indefinitely; revisiting
  that is a separate decision.
- Renaming `taso-*` modules. TASO is a proper noun, already English-safe.
- Adding, removing or renaming competitions.
- **Competition and group names.** They are displayed as they are, and this
  spec introduces no translation layer:
  - TASO's `group_name` is rendered verbatim ("Runkosarja",
    "Mestaruussarja"), per `specs/009-veikkausliiga.md`.
  - `SUPPORTED_COMPETITIONS`' names are curated display names.
    "Valioliiga" stays "Valioliiga" — it is the established Finnish name for
    that competition, not a mechanical translation, and confirmed as
    intended.
  - The one lookup that exists, `displayGroupName`, maps TASO's literal
    `"1"` to "Runkosarja" for 2015/2018. That is a fallback for a missing
    name, documented in spec 009, not a translation — and it stays.

  Recorded here so that "English code, Finnish URLs" is not later read as
  licence to anglicise competition names.

## UX / UI (Finnish strings)

**No new strings and no visual change.** What changes is the address bar:

| Today | After |
|---|---|
| `/sarjataulukko?kilpailu=PL&kausi=2025` | `/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2025` |
| `/ottelut?kilpailu=PL&kierros=12` | `/ulkomaat/ottelut?kilpailu=PL&kierros=12` |
| `/joukkue/57?kilpailu=PL` | `/ulkomaat/joukkue/57?kilpailu=PL` |
| `/standings`, `/kotimaa/standings`, `/matches`, … | redirect to the Finnish equivalent |

That last row is the part most easily missed, so to be explicit about what
those paths are: they are the **English App Router folder paths** —
`src/app/standings/page.tsx` and friends — and they are reachable public
URLs today, because a Next rewrite does not block its own target. Confirmed
on a running server, with no redirects configured:

```
/sarjataulukko         -> 200      /standings          -> 200
/kotimaa/sarjataulukko -> 200      /kotimaa/standings  -> 200
/ottelut               -> 200      /matches            -> 200
```

So every page currently answers on two addresses, one Finnish and one
English. Nothing in `src/` links to the English one — you reach it only by
typing it — but it responds, which is why closing it belongs in this
section rather than being treated as an internal detail.

- URL segments stay Finnish; folders and identifiers become English. The two
  conventions in `CLAUDE.md` — Finnish for users, English for code — are
  both satisfied for the first time, with the rewrite layer bridging them.
- `/ulkomaat` and `/kotimaa` keep their current job as pickers. Their links
  move to the new paths.
- Back-links (`specs/007-back-navigation.md`) keep their existing Finnish
  labels; only their targets move.
- A visitor arriving on an old or English URL lands on the Finnish one with
  their query intact. Nothing is shown to explain the move.

## API & Data

**No API, data or caching change whatsoever.** No provider call, database
query, cache key or TTL is touched — the same page components run, only
mounted at different paths under different names. Recorded explicitly
because the checklist asks, not because there is anything to decide.

### Redirects

`next.config.ts` has only `rewrites()` today; this adds `redirects()`:

```ts
async redirects() {
  return [
    // The move.
    { source: "/sarjataulukko", destination: "/ulkomaat/sarjataulukko", permanent: true },
    { source: "/ottelut", destination: "/ulkomaat/ottelut", permanent: true },
    { source: "/joukkue/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
    // English paths are not URLs.
    { source: "/kotimaa/standings", destination: "/kotimaa/sarjataulukko", permanent: true },
    { source: "/kotimaa/matches", destination: "/kotimaa/ottelut", permanent: true },
    { source: "/kotimaa/team/:id", destination: "/kotimaa/joukkue/:id", permanent: true },
    { source: "/ulkomaat/standings", destination: "/ulkomaat/sarjataulukko", permanent: true },
    { source: "/ulkomaat/matches", destination: "/ulkomaat/ottelut", permanent: true },
    { source: "/ulkomaat/team/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
  ];
}
```

Verified against Next's documentation, and the loop risk verified by
running it rather than reasoning about it:

- `permanent: true` emits **308**, preserving the request method.
- **Query strings forward automatically** — no `:path*` handling needed to
  keep `?kilpailu=` and `?kausi=`.
- **Redirects are checked before rewrites.** This is what makes the pairing
  safe: a request for `/kotimaa/sarjataulukko` matches no redirect and is
  rewritten internally to `/domestic/standings`; the internal
  rewrite does not re-enter the redirect table, so it cannot bounce back.
  Measured on a running server: the Finnish URL returned `200` with **0
  redirects**, the English URL returned `200` after exactly **1**, and
  `?kilpailu=PL&kausi=2025` survived intact.
- The `/` before `:id` is required; without it the segment is treated as a
  literal and can cause an infinite redirect.

### Rewrites

Finnish URL to English folder, both sections:

```
/kotimaa/sarjataulukko  -> /domestic/standings
/kotimaa/ottelut        -> /domestic/matches
/kotimaa/joukkue/:id    -> /domestic/team/:id
/kotimaa                -> /domestic
/ulkomaat/sarjataulukko -> /foreign/standings
/ulkomaat/ottelut       -> /foreign/matches
/ulkomaat/joukkue/:id   -> /foreign/team/:id
/ulkomaat               -> /foreign
```

Note the section roots move too: `/kotimaa` now rewrites to `/domestic`,
where today `src/app/kotimaa/page.tsx` is served directly.

### The rename

| From | To |
|---|---|
| `src/app/kotimaa/` | `src/app/domestic/` |
| `src/app/ulkomaat/` | `src/app/foreign/` |
| `src/app/{standings,matches,team}/` | `src/app/foreign/{standings,matches,team}/` |
| `src/lib/kotimaa-competitions.ts` | `src/lib/domestic-competitions.ts` |
| `src/lib/kotimaa-page-context.ts` | `src/lib/domestic-page-context.ts` |
| `KOTIMAA_COMPETITIONS`, `KotimaaCompetition`, `KotimaaPageContext`, `resolveKotimaaPageContext`, `parseKotimaaCompetitionParam`, `getKotimaaCompetitionName`, the `Kotimaa*PageProps` types | `Domestic*` equivalents |
| `tests/unit/app/{kotimaa,ulkomaat}/`, `tests/unit/lib/kotimaa-*.test.ts`, `tests/e2e/kotimaa-*.spec.ts` | `domestic`/`foreign` equivalents |

`DEFAULT_KOTIMAA_COMPETITION_CODE` becomes `DEFAULT_DOMESTIC_COMPETITION_CODE`.
Its value stays `"VL"` — that is a TASO category id, not a Finnish word.

## Edge Cases

- **An old URL with query parameters** — forwarded intact by Next, measured
  rather than assumed. Asserted in tests.
- **An old team URL with a dynamic segment** — `/joukkue/57` must reach
  `/ulkomaat/joukkue/57`, not a literal `/ulkomaat/joukkue/:id`.
- **A redirect chain.** `/joukkue/57` must not redirect to
  `/ulkomaat/joukkue/57` and then again to something else. Every redirect
  lands on a final Finnish URL in one hop; asserted by checking the
  redirect count, not just the destination.
- **308 is cached by the client.** Once followed, a browser will not
  re-check, so reversing this is awkward for anyone who has visited.
  Accepted deliberately: the move is intended to be final, and the app is
  not yet in production (#140).
- **`/kotimaa` and `/ulkomaat` themselves are not redirected.** They are
  real pages and stay reachable at their Finnish paths.
- **An unknown path under either section** falls through to the normal 404.
- **Client-side navigation** uses the updated links, so it never traverses a
  redirect. Redirects exist for external links and bookmarks only.
- **Finnish left in code after the rename.** `kilpailu`, `kausi` and
  `kierros` are query-parameter names and stay Finnish — they are part of
  the URL, which is the user-facing surface. Same for the Finnish UI strings
  themselves. The rename covers identifiers, files and folders only.

## Performance & Limits

One extra HTTP round trip for visitors arriving on an old or English URL,
and only the first time per client since a 308 is cached. Internal
navigation never hits a redirect because every link is updated. No change to
rendering, data fetching or caching.

## Security & Secrets

No new environment variables and no secrets involved. `.env.example` is
unchanged.

Redirect sources are fixed literal paths with a single typed segment, so
there is no open-redirect surface: no destination is derived from user
input.

## Acceptance Criteria

- [ ] `/ulkomaat/sarjataulukko`, `/ulkomaat/ottelut` and
      `/ulkomaat/joukkue/:id` serve what the top-level routes serve today.
- [ ] `/sarjataulukko`, `/ottelut` and `/joukkue/:id` return **308** to
      their `/ulkomaat/` equivalents.
- [ ] **No English path serves a page.** Every one redirects to its Finnish
      equivalent, in a single hop.
- [ ] Query strings survive every redirect —
      `/joukkue/57?kilpailu=PL&kausi=2024` lands on
      `/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024`.
- [ ] No link, form action or back-link in `src/` points at a top-level or
      English route; internal navigation never traverses a redirect.
- [ ] No file or folder name in `src/` or `tests/` contains `kotimaa` or
      `ulkomaat`:

      ```sh
      find src tests -iname "*kotimaa*" -o -iname "*ulkomaat*"   # must be empty
      ```

- [ ] No **identifier** contains them. Checked via the capitalised forms,
      since identifiers are `PascalCase` or `UPPER_SNAKE` while URLs are
      lowercase:

      ```sh
      grep -rn "Kotimaa\|KOTIMAA\|Ulkomaat\|ULKOMAAT" src/ tests/ next.config.ts
      ```

      Every hit must be a Finnish UI label or a test asserting one — the
      region picker's `label: "Kotimaa"` / `"Ulkomaat"` and the
      `getByRole("link", { name: /Kotimaa/ })` assertions against them.

- [ ] Lowercase `kotimaa`/`ulkomaat` may appear freely: those are **URL
      literals** (`href={`/kotimaa/sarjataulukko…`}`, redirect and rewrite
      `source` paths) and doc comments naming them. They are the point of
      the change, not a violation of it.
- [ ] Finnish query-parameter names (`kilpailu`, `kausi`, `kierros`) and all
      Finnish UI strings are unchanged.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit` (100%
      coverage maintained), `npm run test:integration` and
      `npm run test:e2e` all pass.

## Tests Required

- `tests/e2e/{standings,matches,team,picker}.spec.ts` and the renamed
  `domestic-*.spec.ts` — updated to the new Finnish paths, since they
  navigate to these routes throughout.
- **New redirect coverage**, asserted against a real server rather than the
  config: for each old and each English path, the final URL is the Finnish
  one, the redirect count is exactly 1, and query strings survive.
- `tests/unit/app/{domestic,foreign}/**/page.test.tsx` — the existing page
  tests, moved and renamed with the components they import.
- No new unit tests for the redirect table itself: it is declarative config
  with no branch to cover, and asserting the config back to itself would be
  a test that cannot fail.

## Files To Update

- `next.config.ts` — add `redirects()`, rewrite the whole `rewrites()` table.
- The folder moves and file renames in the table above.
- `src/app/page.tsx` — region picker links (paths unchanged, but verify).
- `src/app/foreign/page.tsx` and `src/app/domestic/page.tsx` — picker links.
- `src/components/standings-controls.tsx`, `matches-controls.tsx`,
  `team-season-selector.tsx` — form actions and navigation bases.
- The moved `foreign/matches/page.tsx` and `foreign/team/[id]/page.tsx`
  back-links.
- Every import of the two renamed `lib` modules.
- A short "routes and names moved" pointer in the specs that document these
  paths — 002, 004, 005, 006, 007, 008, 009 — rather than rewriting every
  occurrence, matching how supersession is recorded in 004 and 009.
- `decisions/012-finnish-urls-english-code.md`, written by the implementing agent.
- No change to `.env.example`, the database schema, or `docs/setup/`.

## Open Questions

None. Two decisions were settled before this spec was written: the old URLs
redirect **permanently (308), kept indefinitely**, chosen over a temporary
307 because the move is intended to be final; and the English names are
**`domestic`/`foreign`**, chosen over `international` because these are
foreign club leagues rather than national-team football, and over
`finland`/`abroad` because naming one country ages badly.
