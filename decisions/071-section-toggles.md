# 071 — Hide and show a page's sections: decisions

Feature #697, `specs/071-section-toggles.md`. A page's sections and every group
inside `Analyysit` fold. A page opens on its most basic part (decisions/714), and
a signed-in reader's choices are stored per kind of page.

This overrides two earlier records. decisions/416's "open by default" and
"Resetting on every load" for the team page's folds now hold only for the match
list, and only for a reader with no stored choice: `Analyysit` starts closed,
and a signed-in reader's folds are remembered. decisions/629's `Kilpailut
rinnakkain` still starts closed, but its "The fold resets on every load" and
"Remembering the choice: Not done" no longer hold.

| Decision | Why |
|---|---|
| Three kinds of page: `team` (every club's team page, domestic, foreign or a national competition's), `national-team` (Huuhkajat, Helmarit) and `standings` (every standings page) | The spec's "per kind of page": opening `Muut kaudet` on Arsenal's page opens it on every team page. A national team page has its own kind, since its groups are years, not seasons |
| Each kind's sections and their defaults are one typed map, `DEFAULT_OPEN` in `src/lib/section-keys.ts`. Its keys are stable English: `matches`, `analytics`, `knockout`, `cup-forecast`, and for the groups their existing element ids, such as `analytics-other-seasons` | The type makes every key carry a default, and the same map is the server action's allowlist, so a key cannot be stored without one. Renaming a Finnish heading keeps a stored choice |
| A team page: `Ottelut` starts open; `Analyysit` starts closed, and opened, its first group shown is open and the rest closed | #714 makes the match list the most basic part. Q1, answered again on 2026-10-24: "First group only". Which group is first differs by page, `Kausi lyhyesti` only where its sentences hold, so the first one shown opens through `sectionOpen`'s `first`, not by a key's default |
| A national team page: the years stay as they are, open and not stored (Q2); `Analyysit` starts closed, and opened, its first group shown is open | The years are lists inside a section |
| A standings page: each headed table starts open and is not stored (Q6). `Pudotuspelit` is stored, closed, except on a Suomen Cup, where it is the first section and opens. A league's knockout lists start closed and are not stored (Q7). `Cupin ennuste` is stored, closed. `Analyysit` is stored, closed: its first group, `Tämä kausi`, opens with it, the other two closed. The cup rounds stay as #698 left them | Q6 and Q7 were answered on 2026-10-24. A group's name differs by competition and season, so a stored `Lohko C` would mean nothing elsewhere. The first section opens whatever its kind's default, through `sectionOpen`'s `first` |
| `Pudotuspelit` is one stored choice for every standings page | The spec stores per kind of page, and a standings page is one kind. Closing it on a Suomen Cup closes it on the Champions League too |
| A table with no heading, a one-table league's such as `Valioliiga`, does not fold. Nor does the legend | A fold is pressed by its heading, and adding a heading would be a new string |
| Stored in `section_choice`: an id, `user_id` (cascading on delete), `page_kind`, `section`, `open`, `updated_at`, and a unique index on the user, kind and section. Migration `0020_create_section_choices` | The favourites tables' shape. The unique index makes a save replace the earlier one, so the last write wins (Q5) |
| `getPageSections(kind)` reads once per page render, with the session the page already reads. A failed read gives the defaults and logs `Reading section choices failed`. A session that cannot be read counts as signed out | Spec, API & Data and Logging. A reader is never shown an error for a preference |
| `saveSectionChoiceAction` refuses an unknown kind of page or section, a state that is not a boolean, and a request with no session. Each logs `Section choice refused` with the two keys cut to 40 characters. A failed write logs `Saving a section choice failed`. A success logs nothing | Spec, Security and Logging. The keys come from the request, so they are cut short before logging |
| `SectionFold` is the one client fold: a region named by its heading, a `<details>` whose summary holds the shared marker and the heading. It keeps its state, saves a toggle when it names what to remember, ignores the toggle event a browser fires for the state it rendered, and reports a send that failed with `reportClientError`. `TeamPageFold`, `TableFold` and `GroupFold` render through it | One fold, so every section behaves alike. A signed-out reader's fold names nothing to remember and saves nothing. The fold stays as the reader set it either way (Q4) |
| Every heading keeps its level and look: a table's `h2` in `TABLE_HEADING`, a group's `h3` in `GROUP_HEADING`, `Analyysit` as `h2` on each page as before. The marker comes before each | The spec's UX section |
| No page links to an anchor inside a fold, so nothing opens a fold from a link (Q3) | Searched `src` for in-page `#` links on 2026-10-24 and found none |
| Tests: unit for the defaults and keys, the read, the action's refusals and failures, the fold's saving, and each page folding from its input. Integration for the round trip, a second save replacing the first, kinds and readers kept apart, and the cascade. End to end in `section-toggles.spec.ts` | Spec, Tests Required |
| An end-to-end spec reading a section that now starts closed opens it first, by its heading, through `tests/e2e/folds.ts`. One asserting that something is absent opens the section too. The specs that walk a whole page (contrast, links, table widths) open every fold before measuring | A closed section's content is hidden, so a role query finds nothing there and an absence would pass without being looked for. A walk that skipped closed sections would skip what a reader can open |
