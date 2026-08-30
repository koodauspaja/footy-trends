// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Read from the environment so production can differ from staging. Defaults
 * preserve today's behaviour, so nothing changes until a variable is set.
 *
 * Sentry's own wizard ships development defaults — 100% tracing, PII on — and
 * those are the wrong thing to inherit for a public site. See
 * docs/setup/021-production-environment.md for the values production uses and
 * why.
 */
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1);
const enableLogs = process.env.SENTRY_ENABLE_LOGS !== "false";
const sendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII !== "false";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate,

  // Enable logs to be sent to Sentry
  enableLogs,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});
