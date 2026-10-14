/**
 * Sentry's settings, shared by all three configs: server, edge and client. The
 * sample rate is read from the environment; what an event may carry is fixed.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/565-sentry-11.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */

import type { init } from "@sentry/nextjs";

/**
 * The default when a variable is unset, blank, or unusable: a tenth, so an
 * environment that sets nothing cannot trace every request.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/**
 * A sample rate from a variable. Unset, blank, not a number or outside 0–1
 * falls back to the default.
 *
 * decisions/140-sentry-production-configuration.md
 */
export function sampleRateFrom(
  raw: string | undefined,
  fallback = DEFAULT_TRACES_SAMPLE_RATE
): number {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === "") return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

type DataCollection = NonNullable<Parameters<typeof init>[0]["dataCollection"]>;

/**
 * Header and query names never sent: an address, a proxy hop, or a credential.
 * Matched as parts of a name, case-insensitively.
 *
 * decisions/565-sentry-11.md
 */
export const DENIED_NAME_PARTS = [
  "forwarded",
  "-ip",
  "remote-",
  "via",
  "-user",
  "cookie",
  "auth",
  "token",
  "session",
  "secret",
  "key",
];

/**
 * What an event may carry, in every environment. Every category is stated, so
 * none falls back to Sentry's default of collecting everything.
 *
 * decisions/565-sentry-11.md
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: DENIED_NAME_PARTS },
    response: { deny: DENIED_NAME_PARTS },
  },
  httpBodies: [],
  urlQueryParams: { deny: DENIED_NAME_PARTS },
  graphQL: { document: true, variables: true },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: true,
  frameContextLines: 7,
} satisfies Required<Omit<DataCollection, "queryParams">>;
