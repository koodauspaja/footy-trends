/**
 * Sends one deliberate event to Sentry, using the server runtime's own
 * configuration, and reports whether it was accepted and flushed. Run it with
 * the environment to prove: `npm run verify:sentry`.
 *
 * decisions/230-sentry-delivery-check.md
 * decisions/292-sonar-zero-open-issues.md
 */
import { existsSync } from "node:fs";
import * as Sentry from "@sentry/nextjs";
import { flagFrom, sampleRateFrom } from "../src/lib/sentry-config";
import {
  buildMarker,
  describeDsn,
  describeOutcome,
  describeSettings,
  type Outcome,
} from "./verify-sentry-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Long enough for a slow network, short enough that a dead one does not hang a
 * person.
 *
 * decisions/230-sentry-delivery-check.md
 */
const FLUSH_TIMEOUT_MS = 10_000;

if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * What actually happened, as one of three answers.
 *
 * decisions/230-sentry-delivery-check.md
 * decisions/292-sonar-zero-open-issues.md
 */
function outcomeOf(eventId: string | undefined, flushed: boolean): Outcome {
  if (eventId === undefined) return { kind: "not-sent" };
  return flushed ? { kind: "sent", eventId } : { kind: "not-flushed", eventId };
}

async function main(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";
  const marker = buildMarker(new Date());

  if (dsn === "") {
    err(describeOutcome({ kind: "no-dsn" }, marker));
    process.exitCode = 1;
    return;
  }

  // Read exactly as `sentry.server.config.ts` reads them, so what is printed is
  // what the server runtime would actually use — not a second interpretation
  // that could drift from it.
  const settings = {
    tracesSampleRate: sampleRateFrom(process.env.SENTRY_TRACES_SAMPLE_RATE),
    enableLogs: flagFrom(process.env.SENTRY_ENABLE_LOGS),
    sendDefaultPii: flagFrom(process.env.SENTRY_SEND_DEFAULT_PII),
  };

  out(`Project      ${describeDsn(dsn) ?? "<unrecognised DSN>"}`);
  out(`Settings     ${describeSettings(settings)}`);
  out(`Marker       ${marker}`);
  out();

  Sentry.init({ dsn, ...settings });

  const eventId = Sentry.captureException(new Error(marker));
  const flushed = await Sentry.flush(FLUSH_TIMEOUT_MS);

  const outcome: Outcome = outcomeOf(eventId, flushed);

  if (outcome.kind === "sent") {
    out(describeOutcome(outcome, marker));
    return;
  }

  err(describeOutcome(outcome, marker));
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  err(`Sentry verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
