# 719 — The profile picture's file control is Finnish in every browser: decisions

Bug #719. On `/asetukset` the profile picture's file input showed the browser's
own `Choose File` and `No file chosen` in an English browser. A native file
input draws its button and status itself, in the browser's language. Spec 025
named the label, `Valitse kuva`, but showed the input as `[ file input ]`, as if
it had no words of its own. CLAUDE.md requires every user-facing string to be
Finnish, so the control is now built from ours.

| Decision | Why |
|---|---|
| The native input is hidden entirely (`display: none`), and our own button `Valitse kuva` opens it with `click()` | A visually hidden (`sr-only`) input stays in the accessibility tree, where a screen reader reads its button and status in the browser's language. A real button brings its own keyboard, focus ring and disabled state. The e2e suite cannot show the picker opening, because its sessions never reach the page body, so a scratch Playwright check showed it for Chromium on 2026-10-24 and Firefox and Safari stay a human check on staging |
| A line under it says `Ei valittua kuvaa.` with nothing chosen, and the chosen file's name otherwise. It is the button's `aria-describedby` and is `aria-live`, so a change is announced. A long name wraps anywhere rather than widening the page | It replaces the browser's status, the only other words the native control showed |
| A successful removal empties the input as well as the chosen file | The line says no file is chosen, and choosing the same file again must fire a change. Before, only the chosen file was forgotten, and the native input still showed the old name |
| No other control has the same fault | Checked on 2026-10-23: this is the only native control in `src/` that draws its own words. The search field's clear button has no text, and the refresh dialog is our own markup |
| Missed because the UX sweep's finding was noted on #703 as a comment, not as a scope item, and #703's agreed scope was its three listed lines | So a finding that is not a scope box is filed as its own issue. `skills/ui-review.md` class 8 already names a file input's `Choose File` |
