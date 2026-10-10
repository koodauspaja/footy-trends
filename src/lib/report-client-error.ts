import * as Sentry from "@sentry/nextjs";

/**
 * Sends a failure a client component caught to Sentry, tagged with where it was
 * caught. The browser cannot use the server's logger, and the reader only sees
 * a Finnish notice.
 *
 * decisions/604-client-failures-to-sentry.md
 */
export function reportClientError(error: unknown, where: string): void {
  Sentry.captureException(error, { tags: { where } });
}
