// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

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
