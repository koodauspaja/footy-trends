# 284 — Provider ids and numbers validated: decisions

Chore #284 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **The ids in `normalizeTasoMatch`.** All four columns are `integer NOT NULL`.
  `Number` alone let `""`, `"2abc"` and an over-long digit string through as
  0, NaN and a rounded value: the first two fail the insert for the whole
  season, and the third stores the match under a group or team that exists but
  is not this one.
- **`INT4_MIN`, `INT4_MAX`.** A number outside the range reaches the driver and
  fails the whole season's sync, where it should cost a single field.
- **`optionalNumber`.** `undefined` and `null` both mean not reported, and a
  knockout group omits the stat fields entirely. `Number` alone reads formats
  TASO does not write (`"0x10"` as 16, `"1e2"` as 100, `"+2"` and `" 2"` as 2,
  `""` as 0), each a made-up value that looks like a reported one, and reads
  `"2abc"` as NaN, `"1e400"` as Infinity and `"2.5"` as a decimal, none of
  which an `integer` column takes.
- **`parseProviderId`.** Separate from `optionalNumber` because an id is a key.
  An unusable stat costs one column; a plausible wrong id files real data
  under something else: `"0x10"` read as group 16 is a real group's table with
  a foreign team in it. `Number("-0")` and `Number("")` are zero, which
  `Number.isInteger` accepts and no TASO entity has.
- **The scores in `normalizeTasoMatch`.** They read the same fields the same way,
  so a second copy of the rule only gave them their own `Number` traps.
