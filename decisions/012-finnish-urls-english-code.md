# 012 — Finnish URLs, English code: implementation decisions

Spec: `specs/012-finnish-urls-english-code.md`
Issue: #142

## The scope grew twice, and both times for a good reason

The issue started as "move the foreign routes under `/ulkomaat/`". Writing
the spec surfaced that `/standings` and `/kotimaa/standings` are reachable
URLs — a Next rewrite does not block its own target — so every page answered
on two addresses. Closing that was added.

Reviewing *that* draft raised the mirror problem: if URLs are to be Finnish,
code should be English, and `src/app/kotimaa/` was neither. The rename came
in as the third piece.

Kept as one change rather than three because all of them move the same
folders. Splitting would have moved them twice and left an intermediate
state with Finnish folders serving the new structure.

## The redirect/rewrite pairing was measured, not reasoned

Pairing a rewrite (`/kotimaa/sarjataulukko` → `/domestic/standings`) with a
redirect (`/domestic/standings` → `/kotimaa/sarjataulukko`) looks circular.
It is not, because an internal rewrite never re-enters the redirect table —
but that was verified on a running server before the spec relied on it,
rather than argued from the documentation:

| Request | Status | Hops | Final |
|---|---|---|---|
| `/kotimaa/sarjataulukko` | 200 | 0 | unchanged |
| `/domestic/standings` | 200 | 1 | `/kotimaa/sarjataulukko` |
| `/sarjataulukko?kilpailu=PL&kausi=2025` | 200 | 1 | query intact |

Every redirect emits **308** and resolves in exactly one hop. The hop count
is asserted in `tests/e2e/redirects.spec.ts`, not just the destination: a
chain that happens to end in the right place is still a bug.

## The first redirect table closed only the new leak

The implementation initially redirected `/domestic/*` and `/foreign/*` — the
post-rename rewrite targets — and stopped there. That is the correct set for
the leak this PR *creates*, but it silently dropped every English URL that
answered before the rename. `/standings`, `/matches`, `/team/:id`,
`/kotimaa/standings`, `/kotimaa/matches` and `/kotimaa/team/:id` all returned
200 on main (measured in spec 012) and would have started returning 404,
against the spec's "every English path stops being reachable".

The distinction that was missed: the English folder names changed in this PR,
so "the English path for this page" means two different things before and
after it. Both sets need redirecting, and only the second set is derivable
from the new tree — the first has to be read off the old one.

Caught by Sourcery on the rebased head. Its inline comment listed the wrong
six paths (it named `/ulkomaat/standings` and friends as previously
reachable, which they never were — the foreign pages lived at the top level),
but the underlying gap was real and larger than reported: nine redirects were
missing, not six.

`/ulkomaat/standings`, `/ulkomaat/matches` and `/ulkomaat/team/:id` are in
the table anyway, because the spec's redirect block prescribes them. They
never resolved before, so they close an English spelling of a Finnish URL
that exists now rather than restoring an old address.

## A blanket rename was the wrong tool, three times over

`Kotimaa` → `Domestic` looks like a safe mechanical substitution. It is not,
because the same word is an identifier in some places and a **Finnish UI
string** in others. It broke three things, each found by a failing test
rather than by reading:

1. `tests/unit/app/page.test.tsx` asserted the region picker's link label
   `/Kotimaa/`. The rename turned the assertion into `/Domestic/` while the
   page still rendered "Kotimaa".
2. `tests/e2e/picker.spec.ts` had the same problem in two places.
3. `tests/e2e/domestic-standings.spec.ts` had a third, which survived the
   first sweep because the grep used to find them filtered too aggressively.

`src/app/page.tsx` was excluded from the rename up front for exactly this
reason — the exclusion was right, but it only covered the source, not the
tests asserting it.

The same class of error hit the path rewrite: a regex intended to prefix
`/joukkue` with `/ulkomaat` also matched **inside regex literals** in the e2e
tests, where the preceding character is a backslash rather than a slash. It
produced `/\/kotimaa\/ulkomaat/joukkue\/\d+/` — syntactically broken, and in
one case it consumed a closing delimiter. Sixteen occurrences, caught by
`tsc` rather than by the substitution being careful.

The lesson worth keeping: a rename across a codebase where the same token is
both code and user-facing content cannot be done blind. The verification is
the type checker and the test suite, not the care taken writing the pattern.

## What stays Finnish, and why

- **URLs** — the point of the change.
- **Query parameters** (`kilpailu`, `kausi`, `kierros`) — part of the URL,
  so part of the user-facing surface.
- **UI strings**, including the region picker's "Kotimaa" / "Ulkomaat"
  labels.
- **Competition and group names.** No translation layer is introduced:
  TASO's `group_name` renders verbatim, and `SUPPORTED_COMPETITIONS`' names
  are curated. "Valioliiga" stays — it is the established Finnish name for
  that competition, not a mechanical translation, and was confirmed as
  intended.

The acceptance criterion that checks this was itself wrong on the first
attempt: it claimed the only remaining occurrences would be `src/app/page.tsx`
and `next.config.ts`. In fact 22 files contain the words, because every
domestic page links to `/kotimaa/…` URLs. The criterion now checks the
capitalised forms, which are identifiers, and explicitly permits the
lowercase URL literals.

## `domestic` / `foreign`

Chosen over `international`, which usually means national-team football
rather than foreign club leagues, and over `finland`/`abroad`, which names
one country and would age badly if the app ever covers another. The
codebase's own prose already used "foreign leagues" in spec 009.
