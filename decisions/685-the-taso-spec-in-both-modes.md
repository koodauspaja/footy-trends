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
| The spec defines one test, unconditionally, requiring the health check's TASO result to be `ok` | A file with none is a spec the freshness check can never see covered, and a skipped test is a gap Sonar reports (`typescript:S1607`). Without the stand-in it is 681's test: signed requests answered by TASO. With it, it proves the stand-in is wired in and answering. |
| Not a test that tells the stand-in from TASO | 681 assumed the stand-in refuses `getCompetitions`; since `decisions/674` it answers it, so the health check reads `ok` either way (measured: a stand-in test expecting `error` received `ok`). Telling them apart would need the health check to expose more than it does, for a check no failure has called for. |
| `isFullRun` is unchanged | Letting it ignore a spec file that lists no tests would weaken what a full run means, which is the check the freshness hook rests on. |

## Measured

On 2026-10-21, `E2E_TASO_STUB=1`, a full `npm run test:e2e`:

| Spec | Result | `.e2e-freshness` |
|---|---|---|
| As 681 left it (the control) | 410 passed | not written |
| A first attempt, expecting `error` from the stand-in | 410 passed, 1 failed: `ok` received | not written |
| With this change | see the pull request | |
