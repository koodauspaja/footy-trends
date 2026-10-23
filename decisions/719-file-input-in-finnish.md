# 719 — The profile picture's file control is Finnish in every browser: decisions

Bug #719. On `/asetukset` the profile picture's file input showed the browser's
own `Choose File` and `No file chosen` in an English browser. A native file
input draws its button and status itself, in the browser's language. Spec 025
named the label, `Valitse kuva`, but showed the input as `[ file input ]`, as if
it had no words of its own. CLAUDE.md requires every user-facing string to be
Finnish, so the control is now built from ours.

| Decision | Why |
|---|---|
| The native input stays, visually hidden (`sr-only`), and its label `Valitse kuva` is drawn as a button | The input keeps the keyboard, the picker and its accessible name. Clicking the label, or Enter or Space on the focused input, opens the picker. The label shows the input's focus ring and disabled state through Tailwind's `peer` |
| A line under it says `Ei valittua kuvaa.` with nothing chosen, and the chosen file's name otherwise. It is the input's `aria-describedby` and is `aria-live`, so a change is announced | It replaces the browser's status, the only other words the native control showed |
| No other control has the same fault | Checked on 2026-10-23: this is the only native control in `src/` that draws its own words. The search field's clear button has no text, and the refresh dialog is our own markup |
| Missed because the UX sweep's finding was noted on #703 as a comment, not as a scope item, and #703's agreed scope was its three listed lines | So a finding that is not a scope box is filed as its own issue. `skills/ui-review.md` class 8 already names a file input's `Choose File` |
