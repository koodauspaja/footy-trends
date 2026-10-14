# 281 — A continuation group with no carry-over entry: decisions

Chore #281 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`TasoGroup.group_type`.** It is what lets a missing carry-over entry be
  detected: see `CARRY_OVER_CONFIG` in `taso-standings-service.ts`.
- **`TasoGroup.import_match_group_id`.** Populated for recent seasons (2026's
  splits point at group 1) and `"0"` for older ones: Kakkonen 2019 and Naisten
  SM 2015 both report 0 for groups whose parent is configured.

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`reportUnconfiguredContinuations`.** The config is hand-maintained per
  season, and a missing entry used to fail silently: the group dropped its
  parent round and rendered plausible numbers, zeros at the start of a split.
  Veikkausliiga and Ykkönen both reached their 2026 splits unconfigured, and
  nobody found out until a reader noticed the table.
- **Why it is detectable.** TASO classifies the groups itself:
  `additional_group_stage` is a continuation. Cups use `knockout_final` and
  first rounds `group_stage`, so neither trips it. `import_match_group_id` is
  logged when supplied, because it names the parent.
- **Its scope.** A finished season with stored rows returns before reaching it
  and is never re-checked. A split appears in the season being played, so the
  case it exists for always refreshes; re-checking finished seasons would call
  TASO on every render of every archive page.
