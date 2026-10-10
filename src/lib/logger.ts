import { createRequire } from "node:module";
import path from "node:path";
import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * The Axiom transport, where both its variables are set and this is not a test.
 *
 * decisions/574-pino-transport-target.md
 */
function createTransport() {
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;

  if (process.env.NODE_ENV === "test" || !token || !dataset) {
    return undefined;
  }

  return pino.transport({
    // An absolute path: pino cannot resolve a bare name from inside Next's bundle.
    target: createRequire(path.join(process.cwd(), "package.json")).resolve("@axiomhq/pino"),
    options: {
      dataset,
      token,
    },
  });
}

/**
 * The level when `LOG_LEVEL` does not set one: silent under test, `info` in
 * production, `debug` otherwise.
 *
 * decisions/278-quiet-test-logs.md
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
