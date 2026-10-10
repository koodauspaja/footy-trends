# 288 — vitest 5: decisions

Pull request #288, Renovate's update of vitest to version 5, had no record
and no issue of its own; #531 created this record for a reason cut from a
comment of its code.

## Moved from comments, 2026-10-08

Cut from `tests/unit/lib/auth-client.test.ts` at `ec04260` by #531.

- **Why two tests instantiate what they assert on.** vitest 5 defaults
  `clearMocks` to true, where 4 defaulted to false, so mock call history is
  cleared before each test, and a call made by `warmModules`' import in
  `beforeAll` was gone by the time the test looked. It was fixed in the tests
  and not by setting `clearMocks: false`: the new default is protective, and
  this suite had already been bitten by tests inheriting a neighbour's
  state.
