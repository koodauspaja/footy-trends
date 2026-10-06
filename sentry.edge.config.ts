// Sentry's initialisation for edge features (middleware, edge routes). Needed
// locally too; it is unrelated to the Vercel Edge Runtime.

import * as Sentry from "@sentry/nextjs";
import { flagFrom, sampleRateFrom } from "@/lib/sentry-config";

/**
 * Read from the environment so production can differ from staging. Each
 * default keeps what the runtime did before its variable existed.
 *
 * decisions/140-sentry-production-configuration.md
 */
const tracesSampleRate = sampleRateFrom(process.env.SENTRY_TRACES_SAMPLE_RATE);
const enableLogs = flagFrom(process.env.SENTRY_ENABLE_LOGS);
const sendDefaultPii = flagFrom(process.env.SENTRY_SEND_DEFAULT_PII);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // How likely a trace is sampled.
  tracesSampleRate,

  // Enable logs to be sent to Sentry
  enableLogs,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});
