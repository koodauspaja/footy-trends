// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { flagFrom, sampleRateFrom } from "@/lib/sentry-config";

/**
 * `NEXT_PUBLIC_`-prefixed, because anything read in the browser is inlined into
 * the bundle at build time. Each default keeps what the browser did before
 * its variable existed.
 *
 * decisions/140-sentry-production-configuration.md
 */
const tracesSampleRate = sampleRateFrom(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
const enableLogs = flagFrom(process.env.NEXT_PUBLIC_SENTRY_ENABLE_LOGS);
const sendDefaultPii = flagFrom(process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII);

/*
 * `integrations` is deliberately not set at all. `integrations: []` would
 * replace Sentry's defaults, not remove Replay from them.
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
