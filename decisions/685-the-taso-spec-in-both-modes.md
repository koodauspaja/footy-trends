# 685 — The TASO spec defines a test in both modes: decisions

Bug #685. `decisions/681-taso-request-signing.md` made `tests/e2e/taso.spec.ts`
define its test only without the stand-in, so that nothing was skipped. With
`E2E_TASO_STUB=1` the file then held no test, Playwright listed none from it, and
the freshness reporter's `isFullRun`, which requires every spec file on disk to
have run, never wrote `.e2e-freshness`: every push from a stand-in setup was
blocked, even after a full run passed. This record overrides 681's row on that
spec; its other decisions stand.

| Decision | Why |
|---|---|
| The spec defines exactly one test in each mode | A file with none is a spec the freshness check can never see covered, and a skipped test is a gap Sonar reports (`typescript:S1607`). One test either way satisfies both. |
| With the stand-in, the test requires the health check's TASO result to be `error` | The stand-in refuses `getCompetitions` by design, so `error` proves the server's TASO request went to the stand-in; a run that reached TASO instead would answer `ok` and fail. Without the stand-in, the test still requires `ok`, as 681 decided. |
| `isFullRun` is unchanged | Letting it ignore a spec file that lists no tests would weaken what a full run means, which is the check the freshness hook rests on. |

## Measured

On 2026-10-21, `E2E_TASO_STUB=1`, a full `npm run test:e2e`:

| Spec | Result | `.e2e-freshness` |
|---|---|---|
| As 681 left it (the control) | 410 passed | not written |
| With this change | see the pull request | |
