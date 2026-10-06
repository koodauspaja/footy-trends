import { beforeAll } from "vitest";

/**
 * How long a warming hook may take. Passed per hook: raising the global
 * `hookTimeout` would hide a hang in every other hook.
 *
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */
const WARM_HOOK_TIMEOUT_MS = 20_000;

/**
 * Warms one or more module graphs before the file's tests run: pays their
 * transform once per file, in a hook. `load` is one thunk per module; a module
 * that throws on import has still been transformed.
 *
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */
export function warmModules(...load: Array<() => Promise<unknown>>): void {
  beforeAll(async () => {
    for (const one of load) {
      await one().catch(() => undefined);
    }
  }, WARM_HOOK_TIMEOUT_MS);
}
