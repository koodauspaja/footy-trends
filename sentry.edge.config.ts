// Sentry's initialisation for edge features (middleware, edge routes). Needed
// locally too; it is unrelated to the Vercel Edge Runtime.

import * as Sentry from "@sentry/nextjs";
import { DATA_COLLECTION, filterSpanQueries, sampleRateFrom } from "@/lib/sentry-config";

/**
 * Read from the environment so production can differ from staging. Unset,
 * it takes its default in `src/lib/sentry-config.ts`.
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
});
