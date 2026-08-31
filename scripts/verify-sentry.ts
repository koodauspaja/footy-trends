/**
 * Sends one deliberate event to Sentry, using the **server** runtime's own
 * configuration, and reports whether it was accepted and flushed.
 *
 *   SENTRY_TRACES_SAMPLE_RATE=… NEXT_PUBLIC_SENTRY_DSN=… npm run verify:sentry
 *
 * Why a script and not a route (#230): the wizard's example routes proved the
 * integration once and were deleted in #204, because anything reachable in
 * production is reachable by anyone and theirs logged through `Sentry.logger`,
 * which `LOG_LEVEL` does not govern. A script adds no surface to the deployed
 * app at all — nothing to guard, nothing to stumble into, nothing that can be
 * hit by a crawler.
 *
 * **It covers the server runtime only.** The edge runtime has no equivalent,
 * because reaching it means running code inside the edge sandbox, which a
 * command-line script cannot do. That gap is real and stated rather than
 * papered over; the client half needs no test event, since `NEXT_PUBLIC_`
 * values are inlined at build time and can be read straight out of the shipped
 * bundle.
 *
 * Run it with the environment you want to prove. Against production that means
 * production's variables, the same way `npm run backfill` takes production's
 * `DATABASE_URL` — the values in `.env` are a local convenience and prove only
 * the local configuration.
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

const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

/** Long enough for a slow network, short enough that a dead one does not hang a person. */
const FLUSH_TIMEOUT_MS = 10_000;

if (existsSync(".env")) process.loadEnvFile(".env");

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

  const outcome: Outcome =
    eventId === undefined
      ? { kind: "not-sent" }
      : flushed
        ? { kind: "sent", eventId }
        : { kind: "not-flushed", eventId };

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
