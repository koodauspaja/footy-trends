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

Cut from `src/lib/sentry-config.ts` at `ef99862` by #531.

- **`sentry-config.ts`.** A change is made once and not three times, and
  the parsing has somewhere to be tested: the Sentry config files call
  `Sentry.init` at import, which makes them poor homes for logic worth
  asserting on.
- **`sampleRateFrom`.** `Number("")` is `0`, so an empty variable, one
  copied from `.env.example` or added in a dashboard without a value, would
  silently switch tracing off while looking configured. `Number("high")` is
  `NaN`, which Sentry would take as a rate of nothing at all. A rate outside
  0–1 is meaningless, so it is rejected and not passed through for the SDK
  to interpret.
- **`flagFrom`.** `FALSE` and `" false "` are plainly the same intent, and a
  dashboard is an easy place to acquire a stray space. Anything else (unset,
  blank, a typo) leaves the flag as it was, because the failure that matters
  is a setting silently flipping, not one failing to flip.

## Moved from comments, 2026-10-07

Cut from `sentry.edge.config.ts` at `5b180e0` by #531.

- **Sentry's server and edge settings.** The wizard ships development
  defaults, 100% tracing and PII on, the wrong thing to inherit for a public
  site. `docs/setup/021-production-environment.md` has the values production
  uses and why.
