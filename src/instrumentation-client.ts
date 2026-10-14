// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { DATA_COLLECTION, filterSpanQueries, sampleRateFrom } from "@/lib/sentry-config";

/**
 * `NEXT_PUBLIC_`-prefixed, because anything read in the browser is inlined into
 * the bundle at build time. Unset, it takes its default in
 * `src/lib/sentry-config.ts`.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
const tracesSampleRate = sampleRateFrom(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);

/*
 * `integrations` is deliberately not set at all. `integrations: []` would
 * replace Sentry's defaults, not remove Replay from them.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled.
  tracesSampleRate,

  // What an event may carry, and no credential left in a span's raw URL.
  dataCollection: DATA_COLLECTION,
  beforeSendSpan: filterSpanQueries,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
