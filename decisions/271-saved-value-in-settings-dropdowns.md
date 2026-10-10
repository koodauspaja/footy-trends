# 271 — The settings dropdowns show the saved value: decisions

Bug #271 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/settings-page.tsx` at `a86c1cb` by #531.

- **The `key` on the settings dropdowns.** `defaultValue` is ignored on every
  render after the first, so after a save the server would send the new
  preferences back and the dropdown would keep showing the old one. Keyed on
  the stored value and not on the props object: a re-render that does not
  change what is stored leaves a half-made choice alone.
