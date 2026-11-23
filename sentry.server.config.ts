// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  DATA_COLLECTION,
  filterSpanQueries,
  sampleRateFrom,
  TUNNEL_PATH,
} from "@/lib/platform/sentry-config";

/**
 * Read from the environment so production can differ from staging. Unset,
 * it takes its default in `src/lib/platform/sentry-config.ts`.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
const tracesSampleRate = sampleRateFrom(process.env.SENTRY_TRACES_SAMPLE_RATE);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // How likely a trace is sampled.
  tracesSampleRate,

  // What an event may carry, and no credential left in a span's raw URL.
  dataCollection: DATA_COLLECTION,
  beforeSendSpan: filterSpanQueries,

  // Answers the browser's events on the tunnel and forwards them to Sentry,
  // before the app sees the request. Added to Sentry's defaults, not instead.
  integrations: [Sentry.serveTunnelIntegration({ path: TUNNEL_PATH })],
});
