import { beforeAll } from "vitest";

/**
 * Pays a module graph's transform once per file, in a hook rather than inside
 * whichever test happens to run first.
 *
 * `vi.resetModules()` clears module *instances* before every test, but not
 * Vite's transform cache — so the first import of a page's graph costs seconds
 * while every later one costs tens of milliseconds. Left in the test body that
 * one-off consumed most of a five second budget and timed out at random, on a
 * test that had done nothing slow. That was #384.
 *
 * This exists as a helper rather than as fifteen hand-written hooks because
 * both halves of it are easy to get wrong, and one of them already was:
 *
 * **The failure is swallowed on purpose.** Only the transform is wanted, so a
 * module that throws on import has still done its job here. Without the
 * `catch`, `@/lib/auth` — which refuses to construct without
 * `BETTER_AUTH_SECRET` — took twenty tests down with it in CI, where no `.env`
 * exists. A hook that silently succeeds is correct; a test that needs the
 * module to load will say so itself.
 *
 * **The budget belongs to the hook, not to the repository.** This is the one
 * place in the suite that legitimately spends seconds, and it does it as
 * setup. Raising the global `hookTimeout` to cover it would hand the same
 * allowance to every other hook — including ones written later, for unrelated
 * reasons — which is how a genuine hang stops being visible. So the timeout is
 * passed per hook, and `hookTimeout` stays at its default, where a hook that
 * overruns still means something is wrong.
 *
 * **Twenty seconds is measured, not chosen.** A reporter on `onHookStart` and
 * `onHookEnd` put the slowest of these hooks at **6.2 s** on a developer
 * machine — and that is with every file warming, which is itself the peak:
 * the hooks contend with each other, so the same hook measured 3.3 s when only
 * fifteen files had one. The 10 s default leaves 1.6x over that, which a
 * slower runner can eat; 20 s leaves about 3x. If these numbers drift, measure
 * again rather than nudging the constant.
 */
const WARM_HOOK_TIMEOUT_MS = 20_000;

/**
 * Warms one or more module graphs before the file's tests run.
 *
 * @param load One thunk per module, each returning its dynamic `import()`.
 */
export function warmModules(...load: Array<() => Promise<unknown>>): void {
  beforeAll(async () => {
    for (const one of load) {
      await one().catch(() => undefined);
    }
  }, WARM_HOOK_TIMEOUT_MS);
}
