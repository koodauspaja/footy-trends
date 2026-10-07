# 408 — The refusal-cleared test waits for the button: decisions

Bug #408 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/unit/components/admin-user-table.test.tsx` at `e4b182f` by #531.

- **Why the test waits for the button.** Every action button is
  `disabled={pending}`, and a click on a disabled button is swallowed. The
  refusal is set after an `await` inside `startTransition`, which React
  commits as an ordinary update, so it can reach the screen before the
  transition's own "no longer pending" commit. On a loaded runner the alert
  is then visible while the button is still disabled, the second click does
  nothing, and the alert never clears: three CI failures in which the alert
  was still there, with its text, after the whole 5 s budget. It was stuck,
  not late, and no budget waits that out. So the test waits for the one
  thing the click needs, the button enabled, and then asserts the clear with
  no wall-clock budget at all: `setNotice(null)` runs in the click handler,
  which `fireEvent` flushes before it returns.
- **What #388 measured, kept because it is still true of what it tested.**
  Under four CPU hogs, a 1 s budget on the old assertion failed 1 in 10 and
  5 s failed 0 in 15; and across 12 contended runs `pending` had already
  cleared whenever the alert was visible. That sample was too small for a
  race this rare, which is why its conclusion, "the alert does clear; it
  clears late", did not hold on CI. Mock state leaking from the test above
  was ruled out then and still is: the text is the test's own
  `REFUSALS.failed`.
- **The race could not be forced.** It depends on the order in which React
  commits two updates, which a test cannot choose, and it did not occur in
  25 contended local runs. The fix removes the dependency instead of
  reproducing it.
- **The 15 s limit.** The test's own limit stays above the enablement wait's
  5 s: Vitest's default per-test limit is 5 s (measured: a test sleeping 7 s
  fails at 5008 ms), and the render, the first click and its alert spend
  part of the same time first.
