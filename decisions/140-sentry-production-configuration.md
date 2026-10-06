# 140 — Sentry's production configuration: decisions

Chore #140 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/instrumentation-client.ts` at `dc74e3e` by #531.

- **The browser's sample rates.** A server-only variable reads as
  `undefined` in the browser, which is how the client ends up tracing
  everything while the server behaves. Defaults preserve the earlier
  behaviour, so nothing changes until a variable is set;
  `docs/setup/021-production-environment.md` has production's values.
- **No `integrations` in the browser.** Session Replay was the only
  integration, added by the wizard at `replaysSessionSampleRate: 0.1`: one
  visitor in ten recorded, plus every session with an error. On a public
  site that records real people's browsing for a debugging benefit this app
  has little use for: nearly every page is server-rendered, so a replay shows
  a page load and a click. `integrations: []` would take the global error
  handlers, breadcrumbs and request context with it, so the browser would
  stop reporting most of what Sentry is here for. Omitting the option keeps
  every default, and Replay is not among them, because it only appears when
  explicitly added. If it is ever wanted, it comes back deliberately, with
  `maskAllText` and `blockAllMedia` set explicitly and not inherited.
