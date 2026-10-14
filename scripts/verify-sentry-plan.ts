/**
 * The decisions behind the Sentry verification script, free of the SDK and the
 * network so they can be unit-tested directly.
 *
 * decisions/230-sentry-delivery-check.md
 */

/**
 * A DSN's host and project id, without its public key, which is a credential.
 * `null` for a DSN that does not parse.
 *
 * decisions/230-sentry-delivery-check.md
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
 * The text the operator searches for in Sentry: distinctive, and carrying the
 * moment it was sent.
 *
 * decisions/230-sentry-delivery-check.md
 */
export function buildMarker(now: Date): string {
  return `footy-trends verification ${now.toISOString()}`;
}

export type Settings = {
  tracesSampleRate: number;
  sendDefaultPii: boolean;
  enableLogs: boolean;
};

/**
 * One line, so the values in force are visible beside the event that proves
 * delivery.
 *
 * decisions/230-sentry-delivery-check.md
 */
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
 * What the run proved, and what it did not: a flushed event reached Sentry's
 * ingest endpoint, which does not prove it is visible.
 *
 * decisions/230-sentry-delivery-check.md
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
