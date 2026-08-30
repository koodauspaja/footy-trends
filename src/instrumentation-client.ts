// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * `NEXT_PUBLIC_`-prefixed, because anything read in the browser is inlined into
 * the bundle at build time — a server-only variable reads as `undefined` here,
 * which is how the client ends up tracing everything while the server behaves.
 *
 * Defaults preserve today's behaviour, so nothing changes until a variable is
 * set. See docs/setup/021-production-environment.md for production's values.
 */
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 1);
const enableLogs = process.env.NEXT_PUBLIC_SENTRY_ENABLE_LOGS !== "false";
const sendDefaultPii = process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII !== "false";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /**
   * Session Replay is deliberately absent.
   *
   * The wizard enabled it at `replaysSessionSampleRate: 0.1` — one visitor in
   * ten recorded, and every session in which an error occurred. On a public
   * site with no accounts that records real people's browsing for a debugging
   * benefit this app has little use for: almost every page is server-rendered,
   * so a replay shows a page load and a click.
   *
   * Removing the integration rather than setting its rates to zero also keeps
   * the replay bundle out of every visitor's browser, which zero rates do not.
   *
   * If it is ever wanted, add it back deliberately with `maskAllText` and
   * `blockAllMedia` set explicitly rather than relying on SDK defaults.
   */
  integrations: [],

  // Define how likely traces are sampled.
  tracesSampleRate,

  // Enable logs to be sent to Sentry
  enableLogs,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
