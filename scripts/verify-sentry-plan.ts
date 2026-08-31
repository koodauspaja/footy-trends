/**
 * The decisions behind the Sentry verification script, kept free of the SDK and
 * the network so they can be unit-tested directly — the same split as
 * `backfill-plan.ts` and its entry point.
 */

/**
 * A DSN's public key is a credential. The host and project id are not, and they
 * are the parts that answer "which project did this go to" — which is the whole
 * question the operator is asking.
 *
 * Returns `null` for a DSN that does not parse, rather than echoing an
 * unrecognised string that might be a secret in an unexpected shape.
 */
export function describeDsn(dsn: string): string | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  if (url.username === "") return null;
  const projectId = url.pathname.replace(/^\//, "");
  if (projectId === "") return null;
  return `${url.host}/${projectId}`;
}

/**
 * The text the operator searches for in Sentry. Distinctive enough not to
 * collide with a real error, and carrying the moment it was sent so two runs
 * an hour apart are told apart.
 */
export function buildMarker(now: Date): string {
  return `footy-trends verification ${now.toISOString()}`;
}

export type Settings = {
  tracesSampleRate: number;
  sendDefaultPii: boolean;
  enableLogs: boolean;
};

/** One line, so the values in force are visible beside the event that proves delivery. */
export function describeSettings(settings: Settings): string {
  return [
    `tracesSampleRate=${settings.tracesSampleRate}`,
    `sendDefaultPii=${settings.sendDefaultPii}`,
    `enableLogs=${settings.enableLogs}`,
  ].join("  ");
}

export type Outcome =
  | { kind: "no-dsn" }
  | { kind: "not-sent" }
  | { kind: "not-flushed"; eventId: string }
  | { kind: "sent"; eventId: string };

/**
 * What the run proved, and what it did not.
 *
 * A flushed event proves the SDK reached Sentry's ingest endpoint. It does not
 * prove the event is *visible* — a project's inbound filters or rate limits can
 * still drop it — so the message never claims more than that, and always sends
 * the operator to look.
 */
export function describeOutcome(outcome: Outcome, marker: string): string {
  switch (outcome.kind) {
    case "no-dsn":
      return "No Sentry DSN is set, so nothing could be sent. Set NEXT_PUBLIC_SENTRY_DSN and re-run.";
    case "not-sent":
      return "Sentry accepted no event id. The SDK is not initialised as expected — nothing was sent.";
    case "not-flushed":
      return [
        `Event ${outcome.eventId} was queued but did not flush before the timeout.`,
        "That usually means the network could not reach Sentry's ingest endpoint.",
      ].join("\n");
    case "sent":
      return [
        `Event ${outcome.eventId} was accepted and flushed.`,
        "",
        "That proves the SDK reached Sentry. It does not prove the event is visible —",
        "inbound filters and rate limits can still drop it — so confirm it landed:",
        "",
        `  Sentry -> Issues -> search for:  ${marker}`,
      ].join("\n");
  }
}
