// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { flagFrom, sampleRateFrom } from "@/lib/sentry-config";

/**
 * `NEXT_PUBLIC_`-prefixed, because anything read in the browser is inlined into
 * the bundle at build time — a server-only variable reads as `undefined` here,
 * which is how the client ends up tracing everything while the server behaves.
 *
 * Defaults preserve today's behaviour, so nothing changes until a variable is
 * set. See docs/setup/021-production-environment.md for production's values.
 */
const tracesSampleRate = sampleRateFrom(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
const enableLogs = flagFrom(process.env.NEXT_PUBLIC_SENTRY_ENABLE_LOGS);
const sendDefaultPii = flagFrom(process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII);

/*
 * `integrations` is deliberately not set at all.
 *
 * Session Replay was the only integration here, added by the wizard at
 * `replaysSessionSampleRate: 0.1` — one visitor in ten recorded, plus every
 * session with an error. On a public site with no accounts that records real
 * people's browsing for a debugging benefit this app has little use for:
 * nearly every page is server-rendered, so a replay shows a page load and a
 * click.
 *
 * Passing `integrations: []` would have been wrong. That *replaces* Sentry's
 * defaults rather than removing Replay from them, taking the global error
 * handlers, breadcrumbs and request context with it — so the browser would
 * have stopped reporting most of what Sentry is here for. Omitting the option
 * keeps every default; Replay is not among them, because it only ever appears
 * when explicitly added.
 *
 * If it is ever wanted, it comes back deliberately, with `maskAllText` and
 * `blockAllMedia` set explicitly rather than inherited.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled.
  tracesSampleRate,

  // Enable logs to be sent to Sentry
  enableLogs,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
