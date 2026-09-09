import pino, { type Logger, type LoggerOptions } from "pino";

function createTransport() {
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;

  if (process.env.NODE_ENV === "test" || !token || !dataset) {
    return undefined;
  }

  return pino.transport({
    target: "@axiomhq/pino",
    options: {
      dataset,
      token,
    },
  });
}

/**
 * Silent under test unless `LOG_LEVEL` says otherwise.
 *
 * Application logs are not test output. A page test that renders a competition
 * page reaches `getViewerPreferences`, whose `headers()` call throws outside a
 * request scope — the graceful degradation working exactly as designed — and
 * every one of them printed a full stack trace, burying the results.
 *
 * `LOG_LEVEL` still wins, so `LOG_LEVEL=debug npm run test:unit` brings them
 * back when a test is actually being debugged. The Axiom transport above is
 * already disabled for tests; this is the stdout half of the same decision.
 */
function defaultLevel(): string {
  if (process.env.NODE_ENV === "test") return "silent";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? defaultLevel(),
  base: {
    service: "footy-trends",
    env: process.env.NODE_ENV,
  },
};

const transport = createTransport();

export const logger: Logger = transport ? pino(options, transport) : pino(options);
