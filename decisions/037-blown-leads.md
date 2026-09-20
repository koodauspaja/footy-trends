# 037 — Blown leads: decisions

Implementation notes for `specs/037-blown-leads.md` (#429). The spec says what
the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**Neither direction can quietly lose a match.** Adding a second direction to a
counter is where an off-by-one hides: a match that is neither a rescued deficit
nor a surrendered lead still has to be somewhere. So `comebacksOf` counts all
three outcomes for both directions although the panel shows two of each, and
the tests assert `won + drew + lost === matches` per direction and
`trailed.matches + led.matches ≤ known`, strict exactly when a match was level
at the break.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The data shape | `Comebacks` became `{ trailed, led, missing, known }`, each direction a `HalfTimeOutcomes` of `{ matches, won, drew, lost }` | The flat alternative — adding `led`, `ledDrew`, `ledLost` beside the existing `trailed`, `won`, `drew` — makes the two directions look like different kinds of thing when they are the same kind counted twice. One shape also lets one component render both groups. |
| Counting the third outcome | Computed, not shown | The spec rules out showing it; computing it is what makes each direction's figures add up to its total, which is the check that no match was dropped. Free, and it caught nothing only because it was there. |
| Level at the break | `continue` before either direction, still counted in `known` | It is neither a deficit nor a lead. Counting it as "not trailed" would be true and useless; counting it as missing would be a lie about the data. |
| One renderer for both groups | `<Direction>` takes the total's label, the two outcome rows and its own empty message | Two copies would be two places for the wrong label or the wrong field — and the mutation swapping `series.led.lost` for `series.led.won` is exactly the mistake a second copy invites. |
| The empty message per direction | Inside `<Direction>`, not in `bodyFor` | One side can be empty while the other is not, and the decision is about that side's data. Keeping it with the group means the caller cannot forget it. |
| The missing line's placement | Once, after both groups, `mt-4` | Both directions count out of the same matches. Two identical lines would read as two gaps (Q1), and the wider margin separates it from the two-column grid above rather than from one column. |
| The rename | `Käännetyt ottelut` → `Kääntyneet ottelut`, swept through the panel, both services' doc comments, `analytics-section.tsx`, three e2e specs and `specs/036` | The old name describes what a team did to a deficit and cannot cover a lead it lost. Approved rather than assumed, because it renames code merged the same day — Miikka: *"changes to previous is ok"* (Q7). |
| `specs/036`'s own strings table | Annotated in place, criterion left unticked and annotated too | A spec that still claims the shipped heading is a contract someone will follow. Ticking its box would also have been false — the heading it names is no longer what the page shows. |

## What the tests prove, and how

- **The arithmetic**, over hand-written seasons where every figure can be
  counted by eye, with sides alternating so reading the wrong side of a fixture
  shows up — in both directions, which is a test the mirror measure needed of
  its own.
- **A match level at half-time** counted in `known` and in neither direction.
- **Each direction's outcomes add up to its matches**, and
  `trailed + led < known` when a level match exists.
- **Against the standings page**, for both providers, with a seventh match
  added to the football-data fixture for the one case its six could not supply:
  a lead given away.
- **TASO's league rule still holds**: the playoff comeback is excluded, and
  counting it would raise `trailed` to 3.
- **End to end against the seeded 2017 season** — no fixture change needed, its
  existing half-time scores already produce every case: HJK a lead held (a
  total with neither outcome beneath it), KuPS a lead lost outright, Ilves two
  leads surrendered to draws and a deficit lost.
- **Six mutations, all caught**: counting a level match into a direction,
  sending every match to `trailed`, dropping `lost`, removing the per-direction
  empty message, using the deficit's message for the lead, and rendering
  `led.won` where `led.lost` belongs.

## Left open, deliberately

- **Matches level at half-time** are counted and never mentioned. A figure for
  them would be a third group answering a question nobody asked.
- **Across seasons** — a club's record for leads given away — belongs to #426.
- **Grouping the panels** is #424's, and this feature was built to keep
  `Analyysit` at eight rather than force that decision early.
