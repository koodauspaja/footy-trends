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

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: "footy-trends",
    env: process.env.NODE_ENV,
  },
};

const transport = createTransport();

export const logger: Logger = transport ? pino(options, transport) : pino(options);
