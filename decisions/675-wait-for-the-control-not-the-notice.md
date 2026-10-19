# 675 — A test waits for the control it clicks next, not only for the notice: decisions

Bug #675. `Profiilikuva > asks for a reload only after a refresh failed, and no
longer once one worked` in `tests/unit/components/settings-page.test.tsx` failed
once, during a full `npm run verify` on 2026-10-19: after the second "Tallenna
kuva" click the reload notice was still shown when the second `waitFor` timed
out at 1000 ms.

| Decision | Why |
|---|---|
| Before its second click, the test waits until "Tallenna kuva" is enabled again | The reload notice is set by the refetch's `catch`, outside the save's transition, so it can render while the transition is still pending and the button is still `disabled`. Whether the transition's end has committed by the time `waitFor` returns depends on timing, and a click on a disabled button does nothing. Waiting for the button is waiting for what the next step depends on. |
| The test asserts that `saveAvatarAction` ran twice | Its last assertion, "Profiilikuva päivitetty.", was already true after the first save, so an ignored second click could only show up as a timeout on the notice. Now it fails saying the save did not run. |
| The component is not changed | A reader cannot click a disabled button either, and the button enables a moment later; the UI reaches the right state. Only the test acted between the two commits. |

## Measured

The issue was first filed as a test-isolation problem: a neighbour leaving a
queued `mockRejectedValueOnce` on the shared `refetch`, the class in
`skills/self-review.md` §4. That did not hold: the file's `beforeEach` resets
`refetch` to resolving before every test, the only queued once-value is this
test's own and it consumes it, and 60 shuffled orders of the file alone and the
reported seed on `main` all passed.

A probe logging the button's `disabled` at two moments, on 2026-10-19:

| Moment | Disabled |
|---|---|
| The notice first seen, inside the first `waitFor` | 7 of 7 runs |
| The test resuming after that `waitFor` | 2 of 20 runs |

With the fix, those 2 runs passed. Without it, no run of the probe left the
button disabled on resume, so the failure did not reproduce on an idle machine.
A 5 ms busy-wait inside the `waitFor` did not force it either: the gap that
matters opens after `waitFor` resolves, not inside its callback. The failure has
been seen only under a full suite's load, and was not reproduced on demand,
because loading the machine would have broken a parallel session's end-to-end
run.

## What this does not do

No other test in the file clicks a control after waiting for a notice, so none
needed the same wait. Other test files were not swept for the pattern.
