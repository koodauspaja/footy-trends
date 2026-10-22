# 071 — Hide and show a page's sections

## Summary

A reader can close any section of a page and every group inside `Analyysit`, and
a signed-in reader's choices are remembered, so a long page opens on what they
came for: its most basic part open, everything else closed until they open it.

## Scope

### In scope

- **Every section below a page's header is a fold.** That covers the season
  table, `Pudotuspelit`, `Ottelut`, `Cupin ennuste`, `Analyysit`, and the other
  sections #714 lists, on the kinds of page #714 orders.
- **Every group inside `Analyysit` is a fold**: `Kausi lyhyesti`,
  `Ottelu ottelulta`, `Kausi kokonaisuutena` / `Koko historia`, `Muut kaudet` /
  `Muut vuodet` and `Vastustajat` on team and national-team pages; `Tämä kausi`,
  `Kausi kaudelta` and `Kilpailut rinnakkain` on standings pages. A capitals
  group label then always toggles, which is the sweep's finding (#695,
  `skills/ui-review.md` class 2).
- **`Analyysit` folds the same way on standings pages as on team pages.** Today
  it is a plain heading there.
- **Defaults:** on each kind of page, the section #714 names as its most basic
  part starts open, for example the season table on a standings page and the
  upcoming matches on a team page. Every other section starts closed.
- **Remembered per signed-in reader, per kind of page:** closing `Muut kaudet`
  on Arsenal's page closes it on every team page. The choice is stored in the
  reader's account, so the server renders the page already folded and it
  follows them to another device.
- **A signed-out reader** gets the defaults and can open and close sections,
  but nothing is remembered: every load starts from the defaults.

### Out of scope

- The order of a page's sections, and which section is its most basic part:
  #714, which goes in first.
- Which panels exist, and their order inside a group (decisions/424).
- Folding a single panel (`h4`). Groups are the reader's questions
  (decisions/424), and they are the unit.
- Skipping a closed section's reads. A closed section is still computed, as
  `Kilpailut rinnakkain` is today (decisions/629), so opening one is instant.
- A settings page entry for resetting the choices.

## UX / UI (Finnish strings)

- **The toggle is the section's heading.** It's a native `<details>` /
  `<summary>` with the shared `FoldMarker` (▸, rotating to point down when open;
  decisions/419), as `Ottelut`, `Analyysit` and `Kilpailut rinnakkain` are
  today.
  - A section keeps its heading level and look: `h2` for a section, `h3` in
    capitals for an `Analyysit` group.
  - A list keeps its count in the toggle, `(24 ottelua)`.
- **No new strings.** No "Näytä" / "Piilota". The heading is the control and
  the marker shows its state. A failed save shows nothing (Q4).
- **Keyboard:** `<summary>` is focusable and opens and closes with Enter and
  Space, as the existing folds do.

## API & Data

- **Storage:** a new store in the database for each reader's choices, keyed by
  user, kind of page and section, holding open or closed. A section with no
  stored choice uses its default. The keys are stable English identifiers, not
  the Finnish headings, so renaming a heading keeps the choice. The table's
  shape is the implementation's (decisions/071).
- **Writing:** a server action saves one choice when the reader opens or closes
  a section. It accepts only a known kind of page and a known section of that
  kind, and refuses anything else. It writes only the signed-in reader's own
  row. A signed-out reader's toggle calls nothing.
- **Reading:** the page reads the reader's choices once, on the server, with
  the session it already reads, and renders each `<details>` open or closed
  from them.
- **Caching:** none. The choices are per reader and read with the page, which
  is `force-dynamic`. No Redis key.

## Edge Cases

- **A section a page does not show today**, such as `Kausi lyhyesti` on a cup
  season or `Vastustajat` on Huuhkajat: no toggle, and a stored choice for it
  is kept and used where the section does appear.
- **A section added later** has no stored choice, so it starts at its default.
- **A default changed later** does not override a choice the reader made.
- **Rapid toggling:** each toggle saves its own choice, and the last save wins.
- **Opening `Analyysit` for the first time:** its groups start open inside it, except `Kilpailut rinnakkain`, which starts closed (decisions/629). So the first open shows the panels, not a column of closed headings (Q1).
- **A save that fails:** the fold still opens or closes on the page, and the failure is logged. The reader is not told. The only cost is that the next load starts from the last stored state (Q4).
- **A link to a section inside a closed fold:** checked during the build. If a page links within itself, the link opens the fold. If none does, the decision record says so and nothing is built for it (Q3).
- **Lists inside a section, such as a cup's rounds and Huuhkajat' years:** they don't fold by this rule and are not remembered. #698 decides how they start. "Juuson kierros" on one cup is not a choice about every cup (Q2).

## Performance & Limits

- **One extra database read per page view** for a signed-in reader, by user and
  kind of page.
- **One write per toggle.** No debouncing, and the last write wins. Revisit only if the logs show load (Q5).
- **Nothing changes in the provider requests or the analytics reads.**

## Security & Secrets

- No new environment variables.
- **The server action** checks the session itself and writes only that user's
  choices. It accepts only the known kinds of page and sections, so a crafted
  request cannot store arbitrary keys.

## Logging

- **A failed read of the choices:** `logger.error({ err }, "Reading section
  choices failed")`, and the page renders the defaults.
- **A failed save:** `logger.error({ err }, "Saving a section choice failed")`,
  matching `settings-actions.ts` and `favourite-actions.ts`.
- **A refused save** (unknown kind of page or section, or no session):
  `logger.warn({ pageKind, section }, "Section choice refused")`, with ids and
  keys only.
- **A successful save:** nothing. It changes only the reader's own preference,
  as saving settings and favourites logs nothing on success.
- **No email address, name or token.** Where the logs go:
  `docs/infrastructure.md`, Observability.

## Acceptance Criteria

- [ ] On each kind of page #714 orders, its most basic part starts open and
      every other section and `Analyysit` group starts closed, for a reader with
      no stored choices
- [ ] Every section below the header and every `Analyysit` group opens and
      closes by mouse and from the keyboard (Enter and Space on its heading)
- [ ] On a standings page `Analyysit` folds as on a team page
- [ ] A signed-in reader who closes `Muut kaudet` on one team page and reloads
      finds it closed, on that page and on another club's team page
- [ ] The same reader, signed in on a second browser, finds the same choices
- [ ] A signed-out reader can open and close sections, and after a reload sees
      the defaults again
- [ ] A save for an unknown kind of page or section is refused and stores
      nothing
- [ ] Every capitals group label in `Analyysit` toggles (`skills/ui-review.md`
      class 2)

## Tests Required

- **Unit** (`tests/unit/…`): the defaults per kind of page; a stored choice
  overriding a default; an unknown key refused; the action without a session
  refused; a failed read giving the defaults; each section component rendering
  `open` from its input.
- **Integration** (`tests/integration/…`): saving and reading a choice against
  the database; a second save replacing the first; a user's deletion removing
  their choices.
- **E2E** (`tests/e2e/section-toggles.spec.ts`): the defaults on a standings
  page and a team page; close, reload, still closed; another club's page
  closed too; signed out back to the defaults after a reload. Then update the
  specs that assume today's open sections: `team-page-fold.spec.ts`,
  `home-advantage.spec.ts`, and every spec reading a panel inside a section now
  closed by default.

## Files To Update

- `specs/071-section-toggles.md` (this file)
- `src/db/schema.ts` and a named migration (`--name=create_section_choices`)
- `skills/ui-review.md`, class 2: points at this spec's rule
- `docs/infrastructure.md`: only if the store changes anything it describes

## Open Questions

None open. Answered by Miikka on 2026-10-23 ("recommendations good"), each as recommended:

1. Groups start open inside `Analyysit`, except `Kilpailut rinnakkain`
2. Lists inside a section (cup rounds, Huuhkajat' years) are not sections. #698 decides how they start, and they are not remembered
3. Links within a page into a closed fold: checked during the build, and built only if one exists
4. A failed save shows nothing and is logged
5. One save per toggle, no debouncing, last write wins

Asked and answered before them, on the same day: groups are the unit, not panels. Every section of a page folds. Choices are stored in the account, per kind of page. Each page opens only its most basic part (#714). `Analyysit` folds on standings pages too. Closed sections are still computed. A signed-out reader gets the defaults, not remembered.
