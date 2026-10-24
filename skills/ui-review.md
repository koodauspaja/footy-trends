# Skill: the pass to run on a change a reader can see

Purpose
Catch what crowds or breaks a page before review does. Not general design
advice: every class below comes from a finding of the UX sweep of 2026-10-21
(#695), which looked at every kind of page in eight views, and each names the
issue it was filed as. A class that stops turning up earns its removal, and a
new finding earns a new class.

When to use
- Before the first push of any pull request that changes what a page shows: a
  new panel, table, chart, line or control, or a change to one.
- After a fix to any of those, on the page it touches.
- As a whole sweep, every few releases or when pages feel crowded: every class
  on every page.

## The pass

1. Run `npm run ux:screenshots`. It starts the e2e suite's own server and
   writes every page of `tests/support/ux-pages.ts`, in eight views, to
   `ux-screenshots/`, with `report.json` saying how far each view scrolls
   sideways. A new kind of page goes into that list in the same pull request.
2. Look at the pages the change touches in all eight views: 375 px and
   1 024 px, light and dark, signed in and out. Start with 375 px, dark,
   signed in, where most of what follows shows first.
3. Read each against the classes below. A finding the pull request does not
   fix is filed, and the pull request says so.
4. `tests/e2e/no-sideways-scroll.spec.ts` runs in the e2e suite, in
   `npm run verify`. It is the one class a test checks for you.

Signed in is a real session: `tests/support/e2e-session.ts` stores a reader,
and an admin for `/yllapito`, in the test database and signs their cookie, so
pages that read the session on the server show what a signed-in reader sees.

## The classes

### 1. Parts that run together (#696)

**What it looks like.** A panel's heading the same small text as a chart label
or a table's group label, so a panel's start cannot be seen. An empty line
larger than the heading above it. Two panels, or a line and the bar under it,
touching. Two tables in one panel with nothing between them. The same kind of
heading in two styles on two pages.

**The counter.** Each part reads as what it is: a section, a panel, a group, a
label, a line. The same kind of part has the same style on every page; the
legal pages (`/tietosuoja`) are the reference for heading levels and space.

### 2. Panels that cannot be hidden (#697)

**What it looks like.** A long run of analytics with no way to put away what
the reader does not want, or a group label that looks like a toggle and is not.

**The counter.** A new section or `Analyysit` group folds by the rule in
`specs/071-section-toggles.md`: it renders through `SectionFold` (as a
`TeamPageFold`, `TableFold` or `GroupFold`), and a remembered one takes its
key and default from `DEFAULT_OPEN` in `src/lib/section-keys.ts`. Only the
page's most basic part starts open.

### 3. Long lists open by default (#698)

**What it looks like.** A page that opens every round's match list, so the
reader scrolls past hundreds of matches to reach the rest.

**The counter.** A list long enough to bury what follows starts closed, and
its toggle says how many it holds.

### 4. A table that hides its key column on a phone (#699)

**What it looks like.** At 375 px a table showing the name and the first
column while the column that matters (points, a result) is out of view, with
nothing to say it scrolls. The same for a bracket.

**The counter.** At 375 px, what the table is for is in view without
scrolling, or the table says there is more.

### 5. Charts that shrink past reading (#700)

**What it looks like.** At 375 px, axis labels shrunk to a few pixels, or more
ticks than the height holds. At 1 024 px, a chart a fixed width in a wider
column.

**The counter.** Fewer ticks, or a taller chart, rather than smaller type; a
chart uses its column's width unless a record says why not.

### 6. Controls that look like text (#701)

**What it looks like.** A link in black with no underline, or a switch between
views as plain bold and grey words.

**The counter.** Links and switches take their look from one place, and can be
told from text in both themes: a link from `globals.css`'s base rule, a switch
from `ViewSwitch`. `links-and-switches.spec.ts` walks pages for a link that is
neither underlined, quiet nor boxed.

### 7. An empty line that says the wrong thing (#702)

**What it looks like.** "No matches played yet" shown because something else
is missing: here, the stored predictions the panel reads.

**The counter.** For each empty, error or "not yet" line, name the condition
that shows it, and check the line says that condition. A failure must never
share a line with "there is nothing" (`skills/self-review.md`, section 5).

### 8. Words that work against each other (#703)

**What it looks like.** A title said twice; "none found" directly above a
link counting four; a number in a format that reads as another; the
browser's own English, such as a file input's `Choose File`, in a Finnish
page.

**The counter.** Read the page's lines in order, as a reader would, and check
that no two of them contradict each other or say the same thing twice.

### 9. A section out of place (#714)

**What it looks like.** A new section appended at the bottom, or placed above
the part of the page the reader came for.

**The counter.** Place it by the order in `decisions/714-page-section-order.md`:
each kind of page has its most basic part first, and #697 opens only that part
by default.

### Width (no issue: none found)

No page scrolled sideways in any of the 248 views, and the e2e test keeps it
so. A table or a bracket wider than the screen scrolls inside its own box.

Related: `skills/self-review.md` for the code-side pass, `decisions/695-ux-sweep.md`
for why the sweep is built as it is.
