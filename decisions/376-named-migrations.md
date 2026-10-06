# 376 — Every migration has a name that says what it does: decisions

Chore #376 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/migration-name.ts` at `5b180e0` by #531.

- **`migration-name.ts`.** Imported by `scripts/generate-migration.ts` and
  by `tests/unit/db/migrations.test.ts`: two enforcement points, one rule. A
  second copy of the pattern would be free to drift, and then the generator
  and the test would disagree about what is legal.
- **`MIGRATION_NAME` is narrow.** The point is to reject the two random
  words `drizzle-kit generate` picks when given no `--name`, and a pattern
  loose enough to accept anything descriptive would accept `young_meteorite`
  too. `MIGRATION_TAG` uses `String.raw` so `\d` is the regex escape it
  looks like.
- **`nameOccurrences`.** Supporting only `--name=x` would refuse a valid
  invocation with "Missing --name", a confusing thing to tell someone who
  gave one. `--name --config=x` would otherwise generate a migration called
  `--config=x`; that is a name with no value, and is reported as one.
- **Duplicate `--name`.** A filter takes the first and a command-line parser
  generally takes the last. The rule `grant-admin` applies to its own
  duplicate flags. The split from the spawning script is the one
  `grant-admin-plan.ts` uses.
- **Forwarding every argument.** A caller who asked for one configuration
  would otherwise quietly get the default: a wrapper changing behaviour it
  was not asked to change.

Cut from `scripts/generate-migration.ts` at `5b180e0` by #531.

- **`generate-migration.ts`.** Seven migrations reached `main` called
  things like `0016_young_meteorite` because the underlying command invents
  two random words when it is not given a name: the failure needed no
  mistake, only the default. `docs/setup/015-database-setup.md` had said to
  pass `--name` the whole time, the evidence that advice was not enough.
  `tests/unit/db/migrations.test.ts` catches such a name if one appears by
  another route; stopping it being created is the better of the two places.
  The decisions live in `migration-name.ts` so they can be tested without
  spawning anything; this file is the side effect.
